import hashlib
from typing import Dict
from models import ABTestConfig

class ABExperimentManager:
    def __init__(self):
        # In a real system, this would be loaded from a database or config management system.
        self.active_experiments: Dict[str, ABTestConfig] = {
            "ranking_strategy_v1": ABTestConfig(
                experiment_id="ranking_strategy_v1",
                variants={"baseline": 0.5, "rl_bandit": 0.5},
                active=True
            )
        }
        self.metrics_store = [] # Mock metrics store

    def get_user_variant(self, user_id: str, experiment_id: str) -> str:
        """Determines the variant for a user deterministically using hashing."""
        experiment = self.active_experiments.get(experiment_id)
        if not experiment or not experiment.active:
            return "baseline" # Default safe variant
        
        # Consistent hashing
        hash_val = int(hashlib.md5(f"{user_id}_{experiment_id}".encode()).hexdigest(), 16)
        normalized_hash = (hash_val % 10000) / 10000.0
        
        cumulative = 0.0
        for variant, allocation in experiment.variants.items():
            cumulative += allocation
            if normalized_hash <= cumulative:
                return variant
        
        # Fallback
        return list(experiment.variants.keys())[0]

    def log_variant_exposure(self, user_id: str, experiment_id: str, variant: str):
        """Logs that a user was exposed to a specific variant (for tracking conversions)."""
        self.metrics_store.append({
            "event": "exposure",
            "user_id": user_id,
            "experiment_id": experiment_id,
            "variant": variant
        })

    def update_config(self, config: ABTestConfig):
        self.active_experiments[config.experiment_id] = config
