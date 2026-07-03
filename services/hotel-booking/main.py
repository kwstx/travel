from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
import os
import asyncio

app = FastAPI(title="Hotel Booking Service")

CONVERSATIONAL_SERVICE_URL = os.getenv("CONVERSATIONAL_SERVICE_URL", "http://conversational:8000")

class SearchHotelsRequest(BaseModel):
    destination: str
    checkin_time: str
    checkout_time: str

@app.post("/tools/search_hotels")
def search_hotels(req: SearchHotelsRequest):
    return {
        "status": "success",
        "hotels": [
            {"hotel_id": "H1", "name": "Grand Plaza", "price_per_night": 200, "checkin_time": req.checkin_time},
            {"hotel_id": "H2", "name": "Boutique Inn", "price_per_night": 150, "checkin_time": req.checkin_time}
        ]
    }

async def register_plugin_with_retry():
    # Retry a few times in case conversational service isn't fully up yet
    for i in range(5):
        try:
            payload = {
                "tool_name": "search_hotels",
                "tool_description": "Search for available hotels based on destination, checkin_time, and checkout_time.",
                "parameters_schema": {
                    "type": "object",
                    "properties": {
                        "destination": {"type": "string"},
                        "checkin_time": {"type": "string"},
                        "checkout_time": {"type": "string"}
                    },
                    "required": ["destination", "checkin_time", "checkout_time"]
                },
                # When running in docker, conversational service accesses hotel-booking by its container name
                "execute_url": "http://hotel-booking:8000/tools/search_hotels"
            }
            resp = requests.post(f"{CONVERSATIONAL_SERVICE_URL}/plugins/register", json=payload, timeout=5)
            if resp.status_code == 200:
                print("Successfully registered search_hotels plugin.")
                return
        except Exception as e:
            print(f"Attempt {i+1}: Failed to register plugin: {e}")
        await asyncio.sleep(5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(register_plugin_with_retry())

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "hotel-booking"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
