import axios from 'axios';
import { FlightProvider, SearchCriteria } from './FlightProvider';
import { UnifiedFlight } from '../models/UnifiedFlight';

export class DuffelProvider implements FlightProvider {
  name = 'Duffel';
  private apiKey = process.env.DUFFEL_API_KEY;
  private baseUrl = 'https://api.duffel.com/air';

  async searchFlights(criteria: SearchCriteria): Promise<UnifiedFlight[]> {
    if (!this.apiKey) {
      console.log('No Duffel token, using mock data.');
      return this.getMockData(criteria);
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/offer_requests`,
        {
          data: {
            slices: [{
              origin: criteria.origin,
              destination: criteria.destination,
              departure_date: criteria.date
            }],
            passengers: Array(criteria.passengers).fill({ type: 'adult' })
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Duffel-Version': 'v1',
            'Content-Type': 'application/json'
          }
        }
      );
      
      const offers = response.data.data.offers;
      return offers.map((offer: any) => this.mapToUnified(offer));
    } catch (error) {
      console.error('Duffel API error, falling back to mock:', error);
      return this.getMockData(criteria);
    }
  }

  private mapToUnified(offer: any): UnifiedFlight {
    const slice = offer.slices[0];
    const firstSegment = slice.segments[0];
    const lastSegment = slice.segments[slice.segments.length - 1];
    
    // Duffel duration is typically ISO 8601 as well
    let durationMinutes = 0;
    if (slice.duration) {
      const hoursMatch = slice.duration.match(/(\d+)H/);
      const minsMatch = slice.duration.match(/(\d+)M/);
      if (hoursMatch) durationMinutes += parseInt(hoursMatch[1], 10) * 60;
      if (minsMatch) durationMinutes += parseInt(minsMatch[1], 10);
    }

    return {
      id: `duffel-${offer.id}`,
      provider: this.name,
      airline: offer.owner.iata_code,
      flightNumber: `${firstSegment.operating_carrier.iata_code}${firstSegment.operating_carrier_flight_number}`,
      departure: {
        airport: firstSegment.origin.iata_code,
        time: firstSegment.departing_at
      },
      arrival: {
        airport: lastSegment.destination.iata_code,
        time: lastSegment.arriving_at
      },
      durationMinutes,
      price: {
        amount: parseFloat(offer.total_amount),
        currency: offer.total_currency
      },
      pnrCandidate: 'DUFFEL123',
      rawProviderData: offer
    };
  }

  private getMockData(criteria: SearchCriteria): UnifiedFlight[] {
    return [
      {
        id: `duffel-mock-1`,
        provider: this.name,
        airline: 'DL', // Using same airline as amadeus mock to test deduplication
        flightNumber: 'DL123',
        departure: { airport: criteria.origin, time: `${criteria.date}T10:00:00Z` },
        arrival: { airport: criteria.destination, time: `${criteria.date}T12:00:00Z` },
        durationMinutes: 120,
        price: { amount: 375.00, currency: 'USD' }, // slightly higher price
        pnrCandidate: 'DUFMCK1'
      }
    ];
  }
}
