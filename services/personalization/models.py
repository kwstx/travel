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

class DisruptionPreferences(BaseModel):
    user_id: str
    auto_approve_price_diff: float = 0.0
    max_acceptable_delay_hours: float = 2.0
    require_same_airline: bool = False

from enum import Enum

class RoleType(str, Enum):
    FAMILY = "family"
    BUSINESS = "business"
    FRIEND = "friend"

class DomainType(str, Enum):
    FLIGHT = "flight"
    HOTEL = "hotel"
    ACTIVITY = "activity"
    CAR = "car"
    GENERIC = "generic"

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

class UserEmbeddingProfile(BaseModel):
    user_id: str
    domain_embeddings: Dict[DomainType, str] = Field(
        default_factory=dict, 
        description="Mapping of DomainType to vector IDs or embedding identifiers"
    )
    cross_domain_preferences: Dict[str, Any] = Field(default_factory=dict)

class RecommendationRequestV2(BaseModel):
    user_id: str
    session_id: str
    domain: DomainType
    context_features: Dict[str, Any] = Field(default_factory=dict, description="Context features relevant to the requested domain")
    candidate_items: List[Dict[str, Any]] = Field(description="List of candidate items represented as dictionaries for multi-domain flexibility")

class RecommendationResponseV2(BaseModel):
    user_id: str
    domain: DomainType
    recommended_items: List[Dict[str, Any]]
    experiment_group: str
    policy_used: str
    plugin_used: str = Field(..., description="Identifies which domain plugin provided the recommendations")

