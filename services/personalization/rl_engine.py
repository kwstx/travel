import numpy as np
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class ContextualBanditEngine:
    def __init__(self):
        # State: simple Q-table or contextual embeddings
        # For this lightweight prototype, we map item_id -> expected reward
        self.q_values: Dict[str, float] = {}
        self.item_counts: Dict[str, int] = {}
        self.epsilon = 0.2  # Exploration rate

    def _get_q(self, item_id: str) -> float:
        return self.q_values.get(item_id, 0.5) # Default optimistic init

    def calculate_reward(self, event_type: str, value: float = None) -> float:
        """
        Calculates the reward incorporating immediate and downstream metrics.
        """
        rewards = {
            "click": 0.1,
            "booking": 1.0,
            "satisfaction_rating": (value - 3.0) * 0.2 if value else 0.0, # 1-5 scale. 4,5 are positive, 1,2 negative
            "post_trip_nps": (value - 5.0) * 0.1 if value else 0.0 # 0-10 scale
        }
        return rewards.get(event_type, 0.0)

    def update_policy(self, item_id: str, reward: float, learning_rate: float = 0.1):
        """Updates the expected reward for an item (Q-learning update)."""
        current_q = self._get_q(item_id)
        self.item_counts[item_id] = self.item_counts.get(item_id, 0) + 1
        
        # Simple Q-learning update rule
        new_q = current_q + learning_rate * (reward - current_q)
        self.q_values[item_id] = new_q
        logger.info(f"Updated Q-value for {item_id}: {current_q:.3f} -> {new_q:.3f}")

    def recommend(self, candidate_items: List[str], context: Dict[str, Any]) -> List[str]:
        """Returns ordered recommendations using epsilon-greedy strategy."""
        if not candidate_items:
            return []

        # Epsilon-greedy: Explore or Exploit
        if np.random.rand() < self.epsilon:
            # Explore: random shuffle
            shuffled = candidate_items.copy()
            np.random.shuffle(shuffled)
            return list(shuffled)
        else:
            # Exploit: sort by descending Q-value
            return sorted(candidate_items, key=lambda x: self._get_q(x), reverse=True)
