import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

# Basic fare rules that prohibit hidden city (mocked for heuristic purposes)
# In reality, this would check fare basis codes or airline policies
STRICT_AIRLINES = ['Lufthansa', 'United Airlines', 'British Airways']

def analyze_hidden_city_opportunity(source: str, destination: str, current_price: float) -> dict:
    """
    Suggests a potential hidden-city routing.
    E.g., if flying JFK -> ATL is $300, but JFK -> MCO (with layover in ATL) is $150.
    Since we don't have a live GDS, we just return a heuristic suggestion to the aggregator
    to search for these specific routes.
    """
    # Just a mock heuristic for common hubs
    hubs = {
        'ATL': ['MCO', 'MIA', 'FLL'],
        'ORD': ['MSP', 'DTW', 'MKE'],
        'DFW': ['IAH', 'AUS', 'SAT'],
        'LHR': ['EDI', 'GLA', 'MAN'],
        'CDG': ['NCE', 'LYS', 'MRS']
    }
    
    if destination in hubs:
        potential_final_destinations = hubs[destination]
        return {
            "type": "hidden_city",
            "description": f"Potential savings: Book a flight to {', '.join(potential_final_destinations)} with a layover in {destination} and drop the final leg.",
            "target_search": {
                "source": source,
                "layover": destination,
                "final_destinations": potential_final_destinations
            },
            "warnings": [
                "Checked baggage will go to the final destination.",
                "Airline may penalize frequent flyer account."
            ]
        }
    return None

def analyze_multi_city_opportunity(itinerary: dict) -> dict:
    """
    Checks if an existing round-trip itinerary can be optimized using an open-jaw or multi-city.
    """
    # We assume 'itinerary' has segments
    segments = itinerary.get('segments', [])
    if len(segments) >= 2:
        # Check if layover is longer than 24 hours (stopover)
        # For simplicity, if duration > 1440 mins
        for seg in segments:
            if seg.get('layover_duration_mins', 0) > 1440:
                return {
                    "type": "multi_city",
                    "description": f"Long layover detected in {seg.get('destination')}. Consider booking a multi-city ticket to explore this city."
                }
    return None

def apply_routing_heuristics(itineraries: List[Dict]) -> List[Dict]:
    """
    Enhances itineraries with heuristic routing suggestions.
    """
    for itin in itineraries:
        itin['routing_suggestions'] = []
        
        # Check hidden city
        airline = itin.get('airline', '')
        if airline not in STRICT_AIRLINES:
            hidden_city = analyze_hidden_city_opportunity(
                itin.get('source', ''),
                itin.get('destination', ''),
                itin.get('price', 0)
            )
            if hidden_city:
                itin['routing_suggestions'].append(hidden_city)
                
        # Check multi-city
        multi_city = analyze_multi_city_opportunity(itin)
        if multi_city:
            itin['routing_suggestions'].append(multi_city)
            
    return itineraries
