from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class FeedbackEvent(BaseModel):
    user_id: str
    session_id: str
    event_type: str = Field(..., description="click, booking, group_booking, satisfaction_rating, post_trip_nps")
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

class NotificationPreferences(BaseModel):
    user_id: str
    alert_on_delay_minutes: int = 30
    alert_on_gate_change: bool = True
    alert_on_cancellation: bool = True

from enum import Enum

class RoleType(str, Enum):
    FAMILY = "family"
    BUSINESS = "business"
    FRIEND = "friend"

class CompanionProfile(BaseModel):
    id: str
    name: str
    base_preferences: Dict[str, Any] = Field(default_factory=dict, description="Structured preference vector")
    qdrant_vector_id: Optional[str] = None

class CompanionLink(BaseModel):
    primary_user_id: str
    companion_id: str
    role: RoleType
    consent_granted: bool = False

class GroupProfile(BaseModel):
    id: str
    name: str
    member_ids: List[str] = Field(default_factory=list, description="List of user or companion IDs")
    shared_preferences: Dict[str, Any] = Field(default_factory=dict, description="Merged or overriding preferences for the group")

