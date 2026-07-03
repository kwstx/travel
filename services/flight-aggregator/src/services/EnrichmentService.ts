import { UnifiedFlight } from '../models/UnifiedFlight';

export class EnrichmentService {
  /**
   * Enriches flight data with ancillary information like baggage and seat maps.
   * In a real system, this might call another service or rely on NDC capabilities
   * returned by Duffel/Amadeus. For now, we simulate this enrichment based on provider/airline.
   */
  public enrich(flights: UnifiedFlight[]): UnifiedFlight[] {
    return flights.map(flight => {
      // Mock enrichment rules
      let baggageIncluded = false;
      let checkedBags = 0;
      let seatSelectionAvailable = true;

      // Low cost carriers typically don't include baggage
      const lowCostCarriers = ['F9', 'NK', 'W6', 'FR']; // Frontier, Spirit, Wizz, Ryanair
      
      if (!lowCostCarriers.includes(flight.airline)) {
        baggageIncluded = true;
        checkedBags = 1;
      }

      // If Duffel provided it, they often have richer NDC ancillaries
      if (flight.provider === 'Duffel') {
        seatSelectionAvailable = true;
        // Maybe Duffel API already had this in rawProviderData
        if (flight.rawProviderData?.ancillaries) {
          // extract actual values
        }
      }

      flight.ancillaries = {
        baggageIncluded,
        checkedBags,
        seatSelectionAvailable
      };

      return flight;
    });
  }
}
