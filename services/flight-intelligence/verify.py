import asyncio
import json
from optimization import optimize_results
from routing_heuristics import apply_routing_heuristics
from forecasting import get_forecast_for_route
from data_loader import load_historical_fare_data

async def run_verification():
    print("Loading historical data...")
    load_historical_fare_data()

    print("\n--- Testing Forecasting ---")
    # Using a common route that should be in the dataset
    forecast = get_forecast_for_route("Bangalore", "Delhi", "2026-08-01")
    print(json.dumps(forecast, indent=2))

    print("\n--- Testing Optimization & Heuristics ---")
    mock_itineraries = [
        {
            "id": "1",
            "source": "JFK",
            "destination": "ORD",
            "airline": "Delta",
            "price": 350.0,
            "duration_mins": 150,
            "stops": 0,
            "amenities": ["Wi-Fi", "Extra Legroom"]
        },
        {
            "id": "2",
            "source": "JFK",
            "destination": "ORD",
            "airline": "Spirit",
            "price": 120.0,
            "duration_mins": 160,
            "stops": 0,
            "amenities": []
        },
        {
            "id": "3",
            "source": "JFK",
            "destination": "ATL",
            "airline": "Delta",
            "price": 200.0,
            "duration_mins": 140,
            "stops": 0,
            "amenities": ["Wi-Fi"]
        }
    ]

    user_prefs = "I prefer comfort, wi-fi, and don't mind paying a bit more for a premium experience."
    
    print("Applying Routing Heuristics...")
    itineraries_with_heuristics = apply_routing_heuristics(mock_itineraries)
    
    print("Running Optimization...")
    optimized = await optimize_results(itineraries_with_heuristics, user_prefs, price_weight=0.3)
    
    for itin in optimized:
        print(f"ID: {itin['id']} | Airline: {itin['airline']} | Price: ${itin['price']} | Utility Score: {itin['utility']:.2f} | Composite: {itin['composite_score']} | Pareto Optimal: {itin['is_pareto_optimal']}")
        if itin.get('routing_suggestions'):
            print(f"   Suggestions: {itin['routing_suggestions']}")

if __name__ == "__main__":
    asyncio.run(run_verification())
