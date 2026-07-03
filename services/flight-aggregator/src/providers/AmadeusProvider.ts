import axios from 'axios';
import { FlightProvider, SearchCriteria } from './FlightProvider';
import { UnifiedFlight } from '../models/UnifiedFlight';

export class AmadeusProvider implements FlightProvider {
  name = 'Amadeus';
  private apiKey = process.env.AMADEUS_API_KEY;
  private apiSecret = process.env.AMADEUS_API_SECRET;
  private baseUrl = 'https://test.api.amadeus.com/v2';
  
  private async getAccessToken(): Promise<string | null> {
    if (!this.apiKey || !this.apiSecret) return null;
    try {
      const response = await axios.post(
        'https://test.api.amadeus.com/v1/security/oauth2/token',
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.apiKey,
          client_secret: this.apiSecret
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return response.data.access_token;
    } catch (e) {
      console.warn('Amadeus auth failed:', e);
      return null;
    }
  }

  async searchFlights(criteria: SearchCriteria): Promise<UnifiedFlight[]> {
    const token = await this.getAccessToken();
    if (!token) {
      console.log('No Amadeus token, using mock data.');
      return this.getMockData(criteria);
    }

    try {
      const response = await axios.get(`${this.baseUrl}/shopping/flight-offers`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          originLocationCode: criteria.origin,
          destinationLocationCode: criteria.destination,
          departureDate: criteria.date,
          adults: criteria.passengers,
          max: 5
        }
      });
      
      return response.data.data.map((offer: any) => this.mapToUnified(offer));
    } catch (error) {
      console.error('Amadeus API error, falling back to mock:', error);
      return this.getMockData(criteria);
    }
  }

  private mapToUnified(offer: any): UnifiedFlight {
    const firstSegment = offer.itineraries[0].segments[0];
    const lastSegment = offer.itineraries[0].segments[offer.itineraries[0].segments.length - 1];
    
    // Parse ISO duration e.g., PT2H30M
    const durationStr = offer.itineraries[0].duration;
    let durationMinutes = 0;
    const hoursMatch = durationStr.match(/(\d+)H/);
    const minsMatch = durationStr.match(/(\d+)M/);
    if (hoursMatch) durationMinutes += parseInt(hoursMatch[1], 10) * 60;
    if (minsMatch) durationMinutes += parseInt(minsMatch[1], 10);

    return {
      id: `amadeus-${offer.id}`,
      provider: this.name,
      airline: firstSegment.carrierCode, // Real system would map to airline name
      flightNumber: `${firstSegment.carrierCode}${firstSegment.number}`,
      departure: {
        airport: firstSegment.departure.iataCode,
        time: firstSegment.departure.at
      },
      arrival: {
        airport: lastSegment.arrival.iataCode,
        time: lastSegment.arrival.at
      },
      durationMinutes,
      price: {
        amount: parseFloat(offer.price.total),
        currency: offer.price.currency
      },
      pnrCandidate: 'AMADEUS123',
      rawProviderData: offer
    };
  }

  private getMockData(criteria: SearchCriteria): UnifiedFlight[] {
    return [
      {
        id: `amadeus-mock-1`,
        provider: this.name,
        airline: 'DL',
        flightNumber: 'DL123',
        departure: { airport: criteria.origin, time: `${criteria.date}T10:00:00Z` },
        arrival: { airport: criteria.destination, time: `${criteria.date}T12:00:00Z` },
        durationMinutes: 120,
        price: { amount: 350.00, currency: 'USD' },
        pnrCandidate: 'AMAMCK1'
      }
    ];
  }
}
