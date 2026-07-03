import numpy as np
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

class PrivacyManager:
    def __init__(self, epsilon: float = 1.0):
        """
        Initializes the PrivacyManager.
        
        Args:
            epsilon: The privacy budget. Lower values provide stronger privacy guarantees 
                     but add more noise to the data.
        """
        self.epsilon = epsilon

    def apply_laplace_noise(self, value: float, sensitivity: float = 1.0) -> float:
        """
        Applies Laplace noise to a continuous value to ensure epsilon-differential privacy.
        
        Args:
            value: The true continuous value.
            sensitivity: The maximum possible difference in the outcome from a single individual's data.
        Returns:
            The noisy value.
        """
        # The scale of the Laplace distribution is sensitivity / epsilon
        scale = sensitivity / self.epsilon
        noise = np.random.laplace(loc=0.0, scale=scale)
        return value + noise

    def apply_randomized_response(self, value: bool) -> bool:
        """
        Applies randomized response for binary categorical data.
        
        Args:
            value: The true binary value (e.g., clicked or not clicked).
        Returns:
            The noisy binary value.
        """
        # Probability of telling the truth is p = e^epsilon / (1 + e^epsilon)
        # Probability of lying is 1 - p = 1 / (1 + e^epsilon)
        p = np.exp(self.epsilon) / (1.0 + np.exp(self.epsilon))
        if np.random.rand() < p:
            return value
        else:
            return not value

    def anonymize_event(self, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Takes a raw event dictionary and returns an anonymized, differentially private version.
        """
        anonymized = event_data.copy()
        
        # Remove direct identifiers
        if 'user_id' in anonymized:
            anonymized['user_id'] = 'ANONYMIZED_USER'
        if 'session_id' in anonymized:
            anonymized['session_id'] = 'ANONYMIZED_SESSION'
            
        # Apply differential privacy to the 'value' if it's a numeric score (e.g., satisfaction rating 1-5)
        # Sensitivity for a 1-5 rating is 4 (max - min)
        if 'value' in anonymized and isinstance(anonymized['value'], (int, float)):
            anonymized['value'] = self.apply_laplace_noise(float(anonymized['value']), sensitivity=4.0)
            
        return anonymized

    def anonymize_dataset(self, dataset: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Applies anonymization and differential privacy to an entire dataset.
        """
        return [self.anonymize_event(event) for event in dataset]
