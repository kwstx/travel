from models import FeedbackEvent
from rl_engine import ContextualBanditEngine
from causal_analysis import CausalAnalyzer
from privacy import PrivacyManager
from fine_tuning import ModelFineTuner
import logging

logger = logging.getLogger(__name__)

class FeedbackCollector:
    def __init__(self, rl_engine: ContextualBanditEngine):
        self.rl_engine = rl_engine
        self.event_store = [] # Mock external datastore (e.g. Redis/PostgreSQL)
        # Mock analytics graph/db for group compositions
        self.group_cooccurrences = {}
        
        # Initialize ML advanced components with strict privacy budget
        self.privacy_manager = PrivacyManager(epsilon=0.5)
        self.causal_analyzer = CausalAnalyzer()
        self.fine_tuner = ModelFineTuner(self.causal_analyzer, self.privacy_manager)

    def process_event(self, event: FeedbackEvent):
        """Process an incoming feedback event."""
        self.event_store.append(event.model_dump())
        logger.info(f"Received event: {event.event_type} for user {event.user_id}")
        
        # Track group-level patterns
        if event.event_type == "group_booking":
            group_members = event.metadata.get("group_member_ids", [])
            if group_members:
                all_members = sorted(list(set(group_members + [event.user_id])))
                if len(all_members) > 1:
                    group_key = tuple(all_members)
                    self.group_cooccurrences[group_key] = self.group_cooccurrences.get(group_key, 0) + 1
                    logger.info(f"Updated group co-occurrence for {group_key}: {self.group_cooccurrences[group_key]} trips")
                    
        # Process post-trip feedback
        if event.event_type == "post_trip_feedback":
            satisfaction = event.value
            pain_points = event.metadata.get("pain_points", [])
            logger.info(f"Processed post-trip feedback for {event.user_id}: score={satisfaction}, pain_points={len(pain_points)}")
            # In a real system we might update RL engine user profile embeddings online here
            # For now, we rely on event_store capturing it for batch retraining

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
        
        # Execute the fine tuning pipeline (anonymizes data, runs causal analysis, simulates fine-tuning)
        if self.event_store:
            self.fine_tuner.run_fine_tuning_job(self.event_store)
            
        logger.info("Retraining complete. Embeddings refined.")
        # Clear or archive processed events
        self.event_store.clear()
