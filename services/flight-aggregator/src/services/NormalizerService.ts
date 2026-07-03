import { UnifiedFlight } from '../models/UnifiedFlight';

export class NormalizerService {
  /**
   * Normalizer ensures that the disparate models conform strictly to UnifiedFlight.
   * Providers already map to UnifiedFlight, but Normalizer can enforce business rules
   * and clean data (e.g. standardizing currency, fixing missing times, etc).
   */
  public normalize(flights: UnifiedFlight[]): UnifiedFlight[] {
    return flights.map(flight => {
      // Example normalizations:
      // Ensure flight number has no spaces
      flight.flightNumber = flight.flightNumber.replace(/\s+/g, '');
      
      // Ensure airline is uppercase
      flight.airline = flight.airline.toUpperCase();

      // Ensure price is up to 2 decimal places
      flight.price.amount = Math.round(flight.price.amount * 100) / 100;
      
      // Can also do currency conversion here if needed, but for now assume USD

      return flight;
    });
  }
}
