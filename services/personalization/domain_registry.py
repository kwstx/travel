from abc import ABC, abstractmethod
from typing import List, Dict, Any
from models import DomainType

class DomainPlugin(ABC):
    """
    Abstract base class for vertical-specific domain plugins (Marketplace/White-label).
    Each plugin knows how to generate recommendations for its specific domain.
    """
    
    @property
    @abstractmethod
    def plugin_name(self) -> str:
        pass

    @property
    @abstractmethod
    def domain_type(self) -> DomainType:
        pass

    @abstractmethod
    def recommend(self, context_features: Dict[str, Any], candidate_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Rank or filter the candidate items based on the context and domain-specific logic.
        """
        pass

class PluginRegistry:
    """
    Registry that maps a DomainType to a list of registered plugins.
    Allows for modular marketplace integrations.
    """
    def __init__(self):
        self._plugins: Dict[DomainType, List[DomainPlugin]] = {}

    def register_plugin(self, plugin: DomainPlugin):
        domain = plugin.domain_type
        if domain not in self._plugins:
            self._plugins[domain] = []
        self._plugins[domain].append(plugin)

    def get_plugins_for_domain(self, domain: DomainType) -> List[DomainPlugin]:
        return self._plugins.get(domain, [])

# Initialize a global registry
registry = PluginRegistry()

# ---------------------------------------------------------
# Mock Plugins for Demonstration
# ---------------------------------------------------------

class FlightMarketplacePlugin(DomainPlugin):
    @property
    def plugin_name(self) -> str:
        return "default_flight_plugin"
        
    @property
    def domain_type(self) -> DomainType:
        return DomainType.FLIGHT
        
    def recommend(self, context_features: Dict[str, Any], candidate_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # In a real scenario, this would use multi-domain embeddings and ML ranking.
        return candidate_items

class HotelWhitelabelPlugin(DomainPlugin):
    @property
    def plugin_name(self) -> str:
        return "hotel_whitelabel_v1"
        
    @property
    def domain_type(self) -> DomainType:
        return DomainType.HOTEL
        
    def recommend(self, context_features: Dict[str, Any], candidate_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Sort or rank hotels based on preferences
        return sorted(candidate_items, key=lambda x: x.get('price', 9999))

# Register default plugins
registry.register_plugin(FlightMarketplacePlugin())
registry.register_plugin(HotelWhitelabelPlugin())
