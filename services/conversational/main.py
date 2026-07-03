from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import os
import uuid
from kafka import KafkaProducer
from qdrant_client import QdrantClient
from qdrant_client.http import models
from langchain_core.messages import HumanMessage
from agent import app_graph

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

# Initialize Qdrant Client
qdrant = None
try:
    qdrant = QdrantClient(host=QDRANT_URL, port=QDRANT_PORT)
    # Create collection if not exists
    qdrant.recreate_collection(
        collection_name="user_conversations",
        vectors_config=models.VectorParams(size=1536, distance=models.Distance.COSINE),
    )
except Exception as e:
    print(f"Failed to connect to Qdrant: {e}")

class MessageRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ConfirmRequest(BaseModel):
    session_id: str
    confirm: bool

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "conversational"}

@app.post("/chat/message")
def process_message(req: MessageRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    session_id = req.session_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": session_id}}
    
    # 1. Retrieve conversation context & profile from Qdrant (mocked context for now)
    user_context = "User prefers window seats and Morning flights. Frequent flyer status: Platinum."
    
    # 2. Invoke LangGraph agent
    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "user_id": x_user_id,
        "context": user_context
    }
    
    # Run the graph
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
        "requires_confirmation": requires_confirmation
    }

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
