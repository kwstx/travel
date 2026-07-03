import numpy as np
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class CausalAnalyzer:
    def __init__(self):
        """
        Initializes the CausalAnalyzer.
        This module isolates the impact of recommendations on outcomes using techniques like Inverse Probability Weighting (IPW).
        """
        pass

    def calculate_treatment_effects(self, interaction_data: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Calculates the Average Treatment Effect (ATE) for different recommendations.
        A 'treatment' is a specific recommendation shown to the user.
        The outcome is whether they booked, clicked, or left a positive review.

        Args:
            interaction_data: A list of dictionaries representing user sessions/events.
                              Expected keys: 'item_id' (treatment), 'outcome_value' (reward/outcome), 'propensity_score' (probability of receiving treatment).
        Returns:
            A dictionary mapping item_ids to their estimated causal impact (feature weights).
        """
        if not interaction_data:
            return {}

        treatment_outcomes: Dict[str, List[float]] = {}
        treatment_weights: Dict[str, List[float]] = {}

        for event in interaction_data:
            item_id = event.get('item_id')
            outcome = event.get('outcome_value', 0.0)
            # Default propensity to 0.5 if unknown to prevent division by zero, though in a real system this comes from the logging policy
            propensity = event.get('propensity_score', 0.5) 
            
            # Clip propensity to avoid extreme weights
            propensity = max(0.01, min(0.99, propensity))

            if item_id:
                if item_id not in treatment_outcomes:
                    treatment_outcomes[item_id] = []
                    treatment_weights[item_id] = []
                
                treatment_outcomes[item_id].append(outcome)
                # Inverse Probability Weighting: weight = 1 / propensity
                treatment_weights[item_id].append(1.0 / propensity)

        causal_impacts = {}
        for item_id, outcomes in treatment_outcomes.items():
            weights = treatment_weights[item_id]
            # Weighted average outcome (IPW estimator for ATE)
            weighted_sum = sum(o * w for o, w in zip(outcomes, weights))
            sum_weights = sum(weights)
            
            if sum_weights > 0:
                causal_impacts[item_id] = weighted_sum / sum_weights
            else:
                causal_impacts[item_id] = 0.0
                
        logger.info(f"Calculated causal impacts for {len(causal_impacts)} items.")
        return causal_impacts
