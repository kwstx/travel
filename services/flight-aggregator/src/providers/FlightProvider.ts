import { UnifiedFlight } from '../models/UnifiedFlight';

export interface SearchCriteria {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  passengers: number;
}

export interface FlightProvider {
  name: string;
  searchFlights(criteria: SearchCriteria): Promise<UnifiedFlight[]>;
}
