from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class FeedbackEvent(BaseModel):
    user_id: str
    session_id: str
    event_type: str = Field(..., description="click, booking, satisfaction_rating, post_trip_nps")
    item_id: Optional[str] = None
    value: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class RecommendationRequest(BaseModel):
    user_id: str
    session_id: str
    context_features: Dict[str, Any] = Field(default_factory=dict, description="e.g., destination, dates, user segment")
    candidate_items: List[str]

class RecommendationResponse(BaseModel):
    user_id: str
    recommended_items: List[str]
    experiment_group: str
    policy_used: str

class ABTestConfig(BaseModel):
    experiment_id: str
    variants: Dict[str, float] = Field(..., description="Variant name to traffic allocation ratio (0.0 to 1.0)")
    active: bool = True
