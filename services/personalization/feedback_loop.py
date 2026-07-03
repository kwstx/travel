from models import FeedbackEvent
from rl_engine import ContextualBanditEngine
import logging

logger = logging.getLogger(__name__)

class FeedbackCollector:
    def __init__(self, rl_engine: ContextualBanditEngine):
        self.rl_engine = rl_engine
        self.event_store = [] # Mock external datastore (e.g. Redis/PostgreSQL)

    def process_event(self, event: FeedbackEvent):
        """Process an incoming feedback event."""
        self.event_store.append(event.model_dump())
        logger.info(f"Received event: {event.event_type} for user {event.user_id}")
        
        # Immediate online update for RL policy
        if event.item_id:
            reward = self.rl_engine.calculate_reward(event.event_type, event.value)
            if reward != 0.0:
                self.rl_engine.update_policy(event.item_id, reward)

    def run_batch_retraining(self):
        """
        Simulates the weekly batch retraining of embeddings via an LLM.
        In production, this would trigger an Airflow DAG or similar batch job
        to re-compute user/item embeddings based on the accumulated event store.
        """
        logger.info(f"Starting weekly batch retraining with {len(self.event_store)} events...")
        # Simulated logic: Extract interactions, call LLM embedding endpoint, update DB
        logger.info("Retraining complete. Embeddings refined.")
        # Clear or archive processed events
        self.event_store.clear()
