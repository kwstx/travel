from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import json
import logging
import time
import hashlib
from redis import Redis, ConnectionError

from forecasting import get_forecast_for_route
from optimization import optimize_results
from routing_heuristics import apply_routing_heuristics
from data_loader import load_historical_fare_data

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Flight Intelligence Engine")

# Setup Redis connection
try:
    redis_client = Redis(host='localhost', port=6379, db=0, decode_responses=True)
    redis_client.ping()
    REDIS_AVAILABLE = True
except ConnectionError:
    logger.warning("Redis not available. Running without caching.")
    REDIS_AVAILABLE = False

# Background initialization of data
@app.on_event("startup")
def startup_event():
    logger.info("Initializing background data loads...")
    load_historical_fare_data()

class Itinerary(BaseModel):
    id: str
    source: str
    destination: str
    airline: str
    price: float
    duration_mins: int
    stops: int
    amenities: Optional[List[str]] = []
    segments: Optional[List[dict]] = []

class OptimizationRequest(BaseModel):
    itineraries: List[Itinerary]
    user_preferences: str
    price_weight: float = 0.5

@app.post("/api/v1/optimize")
async def optimize_flights(req: OptimizationRequest):
    """
    Optimizes a list of itineraries by computing utility, finding the Pareto front,
    and applying heuristics. Results are cached with intelligent invalidation.
    """
    start_time = time.time()
    
    # Generate cache key based on request payload hash
    req_dump = req.json()
    cache_key = f"opt_{hashlib.md5(req_dump.encode()).hexdigest()}"
    
    if REDIS_AVAILABLE:
        cached_result = redis_client.get(cache_key)
        if cached_result:
            logger.info("Serving optimized results from cache.")
            result = json.loads(cached_result)
            result['served_from_cache'] = True
            result['processing_time_ms'] = round((time.time() - start_time) * 1000, 2)
            return result

    itineraries_dict = [itin.model_dump() for itin in req.itineraries]
    
    # Apply routing heuristics
    itineraries_with_heuristics = apply_routing_heuristics(itineraries_dict)
    
    # Optimize results (Utility, Pareto, Scalarization)
    optimized = await optimize_results(
        itineraries=itineraries_with_heuristics, 
        user_preferences=req.user_preferences, 
        price_weight=req.price_weight
    )

    response_data = {
        "optimized_itineraries": optimized,
        "served_from_cache": False,
        "processing_time_ms": round((time.time() - start_time) * 1000, 2)
    }

    if REDIS_AVAILABLE:
        # Intelligent invalidation TTL based on data freshness
        # For simplicity, default to 3600 seconds, but could be dynamic
        ttl = 3600
        redis_client.setex(cache_key, ttl, json.dumps(response_data))

    return response_data

@app.get("/api/v1/forecast")
def get_forecast(source: str, destination: str, target_date: str):
    """
    Returns time-series forecasting model output for optimal booking windows.
    target_date format: YYYY-MM-DD
    """
    cache_key = f"forecast_{source}_{destination}_{target_date}"
    
    if REDIS_AVAILABLE:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
            
    forecast = get_forecast_for_route(source, destination, target_date)
    
    if REDIS_AVAILABLE and forecast.get("forecast_available"):
        # Model uncertainty translates to shorter TTL if highly uncertain
        uncertainty = forecast.get("model_uncertainty", 0)
        ttl = max(600, int(86400 * (1 - min(uncertainty, 0.9)))) # between 10min and 24h
        redis_client.setex(cache_key, ttl, json.dumps(forecast))
        
    return forecast
