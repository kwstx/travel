from fastapi import APIRouter, HTTPException
from models import RecommendationRequestV2, RecommendationResponseV2
from domain_registry import registry
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/recommend", response_model=RecommendationResponseV2)
def get_recommendations_v2(request: RecommendationRequestV2):
    """
    V2 Recommendation Endpoint.
    Routes requests to the appropriate domain plugin based on DomainType.
    Maintains backward compatibility by being entirely separate from V1 routes.
    """
    plugins = registry.get_plugins_for_domain(request.domain)
    
    if not plugins:
        # Fallback or error if no plugin is registered for this vertical
        raise HTTPException(status_code=400, detail=f"No plugins registered for domain {request.domain}")
        
    # For simplicity, we just use the first registered plugin for the requested domain
    plugin = plugins[0]
    
    logger.info(f"Routing recommendation request for domain {request.domain} to plugin {plugin.plugin_name}")
    
    # Process multi-domain candidate items using the vertical-specific plugin
    ranked_items = plugin.recommend(request.context_features, request.candidate_items)
    
    return RecommendationResponseV2(
        user_id=request.user_id,
        domain=request.domain,
        recommended_items=ranked_items,
        experiment_group="v2_modular_rollout",
        policy_used="plugin_delegation",
        plugin_used=plugin.plugin_name
    )
