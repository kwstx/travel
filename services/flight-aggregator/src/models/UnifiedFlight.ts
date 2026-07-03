export interface UnifiedFlight {
  id: string;
  provider: string; // Amadeus, Duffel, Kiwi
  airline: string;
  flightNumber: string;
  departure: {
    airport: string;
    time: string; // ISO 8601
  };
  arrival: {
    airport: string;
    time: string; // ISO 8601
  };
  durationMinutes: number;
  price: {
    amount: number;
    currency: string;
  };
  pnrCandidate?: string;
  ancillaries?: {
    baggageIncluded: boolean;
    checkedBags: number;
    seatSelectionAvailable: boolean;
  };
  rawProviderData?: any; // Useful for debugging or booking execution later
}
