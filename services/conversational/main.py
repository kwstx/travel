from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
import os
from kafka import KafkaProducer
from qdrant_client import QdrantClient
from qdrant_client.http import models

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

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "conversational"}

@app.post("/chat/message")
def process_message(req: MessageRequest, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # 1. Store message in Vector DB (simulated embedding step)
    # 2. Retrieve conversation history & preferences from Vector DB
    # 3. Call LLM (Langchain) to determine intent (e.g. flight search, booking, general chat)
    
    # Simulating LLM Intent Extraction
    intent = "chat"
    if "book" in req.message.lower() or "flight" in req.message.lower():
        intent = "flight_search_requested"
    
    response_text = f"Received your message: '{req.message}'. Intent detected: {intent}"
    
    # Publish to Kafka if actionable intent
    if intent == "flight_search_requested" and producer:
        producer.send("flight-search-requested", {
            "user_id": x_user_id,
            "session_id": req.session_id,
            "raw_message": req.message,
            # In a real scenario, LLM would extract entities: destination, dates, etc.
            "entities": {"destination": "NYC", "date": "2026-08-01"}
        })
        response_text = "I'm looking up flights for you now. I'll notify you shortly."

    return {
        "reply": response_text,
        "intent": intent
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
