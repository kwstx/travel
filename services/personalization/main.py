from fastapi import FastAPI, HTTPException, BackgroundTasks
from models import FeedbackEvent, RecommendationRequest, RecommendationResponse, ABTestConfig, NotificationPreferences
from rl_engine import ContextualBanditEngine
from feedback_loop import FeedbackCollector
from ab_testing import ABExperimentManager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Personalization Service")

# Initialize stateful components
rl_engine = ContextualBanditEngine()
feedback_collector = FeedbackCollector(rl_engine)
ab_manager = ABExperimentManager()

@app.post("/feedback", status_code=202)
def receive_feedback(event: FeedbackEvent, background_tasks: BackgroundTasks):
    """Ingests implicit or explicit feedback signals."""
    background_tasks.add_task(feedback_collector.process_event, event)
    return {"status": "accepted"}

@app.post("/recommend", response_model=RecommendationResponse)
def get_recommendations(request: RecommendationRequest):
    """Provides personalized recommendations based on assigned A/B test variant."""
    experiment_id = "ranking_strategy_v1"
    variant = ab_manager.get_user_variant(request.user_id, experiment_id)
    
    # Log exposure
    ab_manager.log_variant_exposure(request.user_id, experiment_id, variant)
    
    if variant == "rl_bandit":
        # Use RL policy
        ranked_items = rl_engine.recommend(request.candidate_items, request.context_features)
    else:
        # Use Baseline (e.g., just return as-is, simulating a default heuristic)
        ranked_items = request.candidate_items.copy()
        
    return RecommendationResponse(
        user_id=request.user_id,
        recommended_items=ranked_items,
        experiment_group=experiment_id,
        policy_used=variant
    )

@app.post("/ab-test/config")
def update_ab_config(config: ABTestConfig):
    """Updates the A/B testing traffic allocations."""
    ab_manager.update_config(config)
    return {"status": "config_updated"}

@app.post("/admin/retrain")
def trigger_batch_retraining(background_tasks: BackgroundTasks):
    """Manually triggers the weekly batch retraining of embeddings via LLMs."""
    background_tasks.add_task(feedback_collector.run_batch_retraining)
    return {"status": "retraining_started"}

@app.get("/users/{user_id}/preferences/notifications", response_model=NotificationPreferences)
def get_notification_preferences(user_id: str):
    """Returns the user's notification preferences for alerts."""
    # Mocking standard preferences for now
    return NotificationPreferences(
        user_id=user_id,
        alert_on_delay_minutes=30,
        alert_on_gate_change=True,
        alert_on_cancellation=True
    )

