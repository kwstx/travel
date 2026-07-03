import sys
import time
from models import FeedbackEvent, RecommendationRequest
from main import rl_engine, feedback_collector, ab_manager, receive_feedback, get_recommendations
from fastapi import BackgroundTasks

class MockBackgroundTasks(BackgroundTasks):
    def add_task(self, func, *args, **kwargs):
        func(*args, **kwargs)

def verify():
    print("--- Verifying A/B Testing ---")
    user_a = "user_123"
    user_b = "user_456"
    
    req_a = RecommendationRequest(user_id=user_a, session_id="s1", candidate_items=["item1", "item2", "item3"])
    req_b = RecommendationRequest(user_id=user_b, session_id="s2", candidate_items=["item1", "item2", "item3"])
    
    res_a = get_recommendations(req_a)
    res_b = get_recommendations(req_b)
    
    print(f"User A ({user_a}) assigned to: {res_a.policy_used}")
    print(f"User B ({user_b}) assigned to: {res_b.policy_used}")
    
    # Ensure determinism
    res_a2 = get_recommendations(req_a)
    assert res_a.policy_used == res_a2.policy_used, "A/B routing is not deterministic!"
    
    print("\n--- Verifying RL Feedback Loop ---")
    bg_tasks = MockBackgroundTasks()
    
    # Simulate User A booking item2
    receive_feedback(FeedbackEvent(user_id=user_a, session_id="s1", event_type="click", item_id="item2"), bg_tasks)
    receive_feedback(FeedbackEvent(user_id=user_a, session_id="s1", event_type="booking", item_id="item2"), bg_tasks)
    receive_feedback(FeedbackEvent(user_id=user_a, session_id="s1", event_type="post_trip_nps", item_id="item2", value=9.0), bg_tasks)
    
    print(f"RL Q-Values after feedback: {rl_engine.q_values}")
    
    print("\n--- Verifying Recommendation Output ---")
    # Turn off exploration for testing
    rl_engine.epsilon = 0.0
    
    # User in RL group should now see item2 prioritized
    rl_req = RecommendationRequest(user_id="user_rl_test", session_id="s3", candidate_items=["item1", "item2", "item3"])
    # Force rl_bandit for testing
    ab_manager.active_experiments["ranking_strategy_v1"].variants = {"baseline": 0.0, "rl_bandit": 1.0}
    
    rl_res = get_recommendations(rl_req)
    print(f"Ranked items (RL policy): {rl_res.recommended_items}")
    assert rl_res.recommended_items[0] == "item2", "RL Engine failed to prioritize the booked item."
    
    print("\n--- Verifying Batch Retraining Trigger ---")
    feedback_collector.run_batch_retraining()
    
    print("\nVerification Successful! All components working as expected.")

if __name__ == "__main__":
    verify()
