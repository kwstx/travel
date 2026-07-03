import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import uuid
from kafka import KafkaProducer
from qdrant_client import QdrantClient
from qdrant_client.http import models
from langchain_core.messages import HumanMessage
from langchain_openai import OpenAIEmbeddings
from agent import app_graph
import requests
from post_travel import generate_outreach_message, extract_feedback

app = FastAPI(title="Conversational Orchestration Service")

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
QDRANT_URL = os.getenv("QDRANT_URL", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

# Initialize Kafka Producer
producer = None
try:
    producer = KafkaProducer(
        bootstrap_servers=[KAFKA_BROKER],
        value_serializer=lambda m: json.dumps(m).encode('utf-8')
    )
except Exception as e:
    print(f"Failed to connect to Kafka: {e}")

# Initialize Qdrant Client & Embeddings
qdrant = None
try:
    qdrant = QdrantClient(host=QDRANT_URL, port=QDRANT_PORT)
    # Check if collection exists to avoid overwriting memory
    collections = [c.name for c in qdrant.get_collections().collections]
    if "user_conversations" not in collections:
        qdrant.create_collection(
            collection_name="user_conversations",
            vectors_config=models.VectorParams(size=1536, distance=models.Distance.COSINE),
        )
except Exception as e:
    print(f"Failed to connect to Qdrant: {e}")

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

class MessageRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ConfirmRequest(BaseModel):
    session_id: str
    confirm: bool

class PreferenceRequest(BaseModel):
    preference_text: str

class ConsentRequest(BaseModel):
    companion_email_or_phone: str
    role: str
    message: Optional[str] = "Please approve sharing your travel preferences for group booking."

class ItineraryEventRequest(BaseModel):
    itinerary_details: dict

class PostTravelFeedbackRequest(BaseModel):
    session_id: Optional[str] = None
    feedback: str

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "conversational"}

@app.post("/chat/message")
def process_message(req: MessageRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    session_id = req.session_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}
    
    # 1. Retrieve long-term conversation context & profile from Qdrant via RAG
    user_context = "No specific preferences found."
    if qdrant:
        try:
            query_vector = embeddings.embed_query(req.message)
            search_result = qdrant.search(
                collection_name="user_conversations",
                query_vector=query_vector,
                query_filter=models.Filter(
                    must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=x_user_id))]
                ),
                limit=3
            )
            if search_result:
                contexts = [hit.payload.get("text", "") for hit in search_result]
                user_context = " ".join(contexts)
        except Exception as e:
            print(f"Qdrant search failed: {e}")
    
    # 2. Invoke LangGraph agent
    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": x_user_id,
        "context": user_context
    }
    
    # Run the graph (short-term memory is managed automatically by RedisSaver checkpointer)
    app_graph.invoke(input_state, config)
    
    # 3. Check graph state for interruption
    current_state = app_graph.get_state(config)
    
    requires_confirmation = False
    if current_state.next and "sensitive_tools" in current_state.next:
        requires_confirmation = True
        response_text = "I am ready to book the flight. Please confirm if you want to proceed."
    else:
        # Get the last message
        response_text = current_state.values["messages"][-1].content
        
    return {
        "reply": response_text,
        "session_id": session_id,
        "requires_confirmation": requires_confirmation,
        "retrieved_context": user_context
    }

@app.post("/chat/preferences")
def add_preference(req: PreferenceRequest, x_user_id: str = Header(None)):
    """Store explicit preferences or feedback as dense vector embeddings."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if qdrant:
        try:
            vector = embeddings.embed_query(req.preference_text)
            qdrant.upsert(
                collection_name="user_conversations",
                points=[
                    models.PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vector,
                        payload={"user_id": x_user_id, "text": req.preference_text}
                    )
                ]
            )
            return {"status": "Preference saved successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save preference: {e}")
            
    return {"status": "Qdrant not available"}

@app.post("/chat/confirm_booking")
def confirm_booking(req: ConfirmRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    config = {"configurable": {"thread_id": req.session_id}}
    current_state = app_graph.get_state(config)
    
    if not current_state.next or "sensitive_tools" not in current_state.next:
        return {"reply": "No pending booking to confirm.", "session_id": req.session_id}
        
    if req.confirm:
        # Resume the graph by passing None
        app_graph.invoke(None, config)
        new_state = app_graph.get_state(config)
        response_text = new_state.values["messages"][-1].content
    else:
        response_text = "Booking cancelled."
        
    return {
        "reply": response_text,
        "session_id": req.session_id
    }

@app.post("/chat/consent/request")
def request_consent(req: ConsentRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Trigger an async notification (e.g., email/SMS magic link) to the companion
    try:
        if producer:
            event = {
                "event_type": "consent_requested",
                "primary_user_id": x_user_id,
                "target_contact": req.companion_email_or_phone,
                "role": req.role,
                "message": req.message,
                "status": "pending"
            }
            producer.send("consent_events", event)
            producer.flush()
        return {"status": "Consent request initiated asynchronously.", "target": req.companion_email_or_phone}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initiate consent request: {e}")

@app.post("/events/itinerary_completed")
def itinerary_completed_event(req: ItineraryEventRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    outreach_msg = generate_outreach_message(req.itinerary_details)
    
    # Send via notifications_events Kafka topic
    try:
        if producer:
            event = {
                "event_type": "post_travel_outreach",
                "user_id": x_user_id,
                "message": outreach_msg,
                "channel": "push" # Specific channel as requested
            }
            producer.send("notifications_events", event)
            producer.flush()
            return {"status": "Outreach message queued via specific channel", "message": outreach_msg}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send outreach event: {e}")
    return {"status": "Kafka producer not available", "message": outreach_msg}

@app.post("/chat/post_travel_feedback")
def post_travel_feedback(req: PostTravelFeedbackRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # 1. Extract feedback
    extracted = extract_feedback(req.feedback)
    
    # 2. Save reflections to Qdrant
    if qdrant:
        try:
            vector = embeddings.embed_query(extracted.reflections)
            qdrant.upsert(
                collection_name="user_conversations",
                points=[
                    models.PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vector,
                        payload={"user_id": x_user_id, "text": f"Post-trip reflection: {extracted.reflections}"}
                    )
                ]
            )
        except Exception as e:
            print(f"Failed to save reflections to Qdrant: {e}")
            
    # 3. Forward structured data to personalization service
    feedback_payload = {
        "user_id": x_user_id,
        "session_id": req.session_id or str(uuid.uuid4()),
        "event_type": "post_trip_feedback",
        "value": extracted.satisfaction_score,
        "metadata": {
            "pain_points": extracted.pain_points,
            "reflections": extracted.reflections
        }
    }
    
    try:
        resp = requests.post("http://personalization:8000/feedback", json=feedback_payload)
        resp.raise_for_status()
    except Exception as e:
        print(f"Failed to forward feedback to personalization: {e}")
        
    return {
        "status": "Feedback processed successfully",
        "extracted_data": extracted.model_dump()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
