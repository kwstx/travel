import numpy as np
import httpx
import os
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

# Mock function or real call to get embeddings
async def get_text_embedding(text: str) -> np.ndarray:
    """
    Calls an external LLM/embedding API to get the embedding for the text.
    If OPENAI_API_KEY is not set, falls back to a deterministic pseudo-random embedding for testing.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"input": text, "model": "text-embedding-ada-002"}
                )
                response.raise_for_status()
                data = response.json()
                return np.array(data['data'][0]['embedding'])
        except Exception as e:
            logger.error(f"Error fetching embedding from API: {e}")
    
    # Fallback to pseudo-random based on hash of text
    np.random.seed(hash(text) % (2**32))
    return np.random.rand(1536)

async def calculate_utility(itinerary: dict, user_preferences: str) -> float:
    """
    Calculates the user-specific utility of an itinerary based on semantic similarity
    between the itinerary's characteristics and the user's textual preferences.
    """
    # Create a string representation of the itinerary to embed
    itin_desc = f"Flight from {itinerary.get('source')} to {itinerary.get('destination')} " \
                f"on {itinerary.get('airline', 'Unknown Airlines')}. " \
                f"Duration: {itinerary.get('duration_mins', 0)} mins. " \
                f"Stops: {itinerary.get('stops', 0)}. "
    if itinerary.get('amenities'):
        itin_desc += f"Amenities: {', '.join(itinerary['amenities'])}."
    
    user_emb = await get_text_embedding(user_preferences)
    itin_emb = await get_text_embedding(itin_desc)
    
    # Cosine similarity for utility
    similarity = np.dot(user_emb, itin_emb) / (np.linalg.norm(user_emb) * np.linalg.norm(itin_emb))
    # Normalize between 0 and 100 for score
    return max(0, min(100, (similarity + 1) * 50))

def identify_pareto_front(itineraries: List[dict]) -> List[dict]:
    """
    Identifies the Pareto optimal set of itineraries.
    Objective 1: Minimize price
    Objective 2: Maximize utility
    """
    if not itineraries:
        return []

    # Extract price and utility
    # We want to minimize price and minimize (-utility)
    costs = np.array([[itin['price'], -itin['utility']] for itin in itineraries])
    
    is_pareto = np.ones(costs.shape[0], dtype=bool)
    for i, c in enumerate(costs):
        if is_pareto[i]:
            # c is strictly dominated if there is any point j that is <= c in all dimensions 
            # and < c in at least one dimension
            is_pareto[is_pareto] = np.any(costs[is_pareto] < c, axis=1) | np.all(costs[is_pareto] == c, axis=1)
            is_pareto[i] = True  # Keep itself
            
    pareto_optimal_itineraries = []
    for i, is_optimal in enumerate(is_pareto):
        itin = itineraries[i].copy()
        itin['is_pareto_optimal'] = bool(is_optimal)
        pareto_optimal_itineraries.append(itin)
        
    return pareto_optimal_itineraries

def apply_weighted_scalarization(itineraries: List[dict], price_weight: float = 0.5) -> List[dict]:
    """
    Scores itineraries using a weighted sum of normalized price and utility.
    price_weight controls the importance of price (0 to 1).
    utility_weight = 1 - price_weight
    """
    if not itineraries:
        return []
        
    prices = [itin['price'] for itin in itineraries]
    utilities = [itin['utility'] for itin in itineraries]
    
    min_price = min(prices)
    max_price = max(prices) if max(prices) > min_price else min_price + 1
    
    min_util = min(utilities)
    max_util = max(utilities) if max(utilities) > min_util else min_util + 1
    
    utility_weight = 1.0 - price_weight
    
    scored_itineraries = []
    for itin in itineraries:
        # Normalize price (lower is better, so 1 = best price, 0 = worst price)
        norm_price = 1.0 - ((itin['price'] - min_price) / (max_price - min_price))
        # Normalize utility (higher is better, so 1 = best util, 0 = worst util)
        norm_util = (itin['utility'] - min_util) / (max_util - min_util)
        
        score = (norm_price * price_weight) + (norm_util * utility_weight)
        
        itin_copy = itin.copy()
        itin_copy['composite_score'] = round(score * 100, 2)
        scored_itineraries.append(itin_copy)
        
    # Sort by composite score descending
    scored_itineraries.sort(key=lambda x: x['composite_score'], reverse=True)
    return scored_itineraries

async def optimize_results(itineraries: List[dict], user_preferences: str, price_weight: float = 0.5) -> List[dict]:
    """
    Main entry point for optimization logic.
    Calculates utility, identifies Pareto front, and scores using scalarization.
    """
    # Calculate utility for each itinerary
    for itin in itineraries:
        itin['utility'] = await calculate_utility(itin, user_preferences)
        
    # Find Pareto optimal points
    pareto_itineraries = identify_pareto_front(itineraries)
    
    # Apply scalarization
    return apply_weighted_scalarization(pareto_itineraries, price_weight)
