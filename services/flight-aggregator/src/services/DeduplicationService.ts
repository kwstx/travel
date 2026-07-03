import { UnifiedFlight } from '../models/UnifiedFlight';

export class DeduplicationService {
  /**
   * Deduplicates flights from different providers.
   * If Amadeus and Duffel return the same flight, we prioritize Amadeus
   * because it generally has better booking depth and reliability.
   */
  public deduplicate(flights: UnifiedFlight[]): UnifiedFlight[] {
    const uniqueFlights = new Map<string, UnifiedFlight>();

    // Priority order for deduplication: Amadeus > Duffel > Kiwi
    const providerPriority: Record<string, number> = {
      'Amadeus': 1,
      'Duffel': 2,
      'Kiwi': 3
    };

    for (const flight of flights) {
      // Create a unique key based on airline, flight number, date, and origin/destination
      // Using just the date part of the departure time to avoid slight timezone/timestamp variations
      const departureDate = flight.departure.time.split('T')[0];
      const key = `${flight.airline}-${flight.flightNumber}-${departureDate}-${flight.departure.airport}-${flight.arrival.airport}`;

      if (uniqueFlights.has(key)) {
        const existing = uniqueFlights.get(key)!;
        const existingPriority = providerPriority[existing.provider] || 99;
        const currentPriority = providerPriority[flight.provider] || 99;

        // If the new flight has a higher priority (lower number) provider, or is significantly cheaper, we might replace it.
        // For simplicity, we just use provider priority here.
        if (currentPriority < existingPriority) {
          uniqueFlights.set(key, flight);
        }
      } else {
        uniqueFlights.set(key, flight);
      }
    }

    return Array.from(uniqueFlights.values());
  }
}
