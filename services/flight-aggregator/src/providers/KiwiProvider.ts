import axios from 'axios';
import { FlightProvider, SearchCriteria } from './FlightProvider';
import { UnifiedFlight } from '../models/UnifiedFlight';

export class KiwiProvider implements FlightProvider {
  name = 'Kiwi';
  private apiKey = process.env.KIWI_API_KEY;
  private baseUrl = 'https://api.tequila.kiwi.com/v2/search';

  async searchFlights(criteria: SearchCriteria): Promise<UnifiedFlight[]> {
    if (!this.apiKey) {
      console.log('No Kiwi token, using mock data.');
      return this.getMockData(criteria);
    }

    try {
      // Kiwi expects date in DD/MM/YYYY format, so we need to convert from YYYY-MM-DD
      const [year, month, day] = criteria.date.split('-');
      const formattedDate = `${day}/${month}/${year}`;

      const response = await axios.get(this.baseUrl, {
        headers: {
          'apikey': this.apiKey,
          'accept': 'application/json'
        },
        params: {
          fly_from: criteria.origin,
          fly_to: criteria.destination,
          date_from: formattedDate,
          date_to: formattedDate,
          adults: criteria.passengers,
          curr: 'USD'
        }
      });
      
      return response.data.data.map((offer: any) => this.mapToUnified(offer));
    } catch (error) {
      console.error('Kiwi API error, falling back to mock:', error);
      return this.getMockData(criteria);
    }
  }

  private mapToUnified(offer: any): UnifiedFlight {
    const firstSegment = offer.route[0];
    const lastSegment = offer.route[offer.route.length - 1];

    return {
      id: `kiwi-${offer.id}`,
      provider: this.name,
      airline: offer.airlines[0], // Kiwi provides an array of airlines
      flightNumber: `${firstSegment.airline}${firstSegment.flight_no}`,
      departure: {
        airport: offer.flyFrom,
        time: new Date(offer.dTimeUTC * 1000).toISOString()
      },
      arrival: {
        airport: offer.flyTo,
        time: new Date(offer.aTimeUTC * 1000).toISOString()
      },
      durationMinutes: Math.floor(offer.duration.total / 60),
      price: {
        amount: offer.price,
        currency: 'USD' // Configured in params
      },
      pnrCandidate: offer.booking_token, // Can be used as a candidate for booking
      rawProviderData: offer
    };
  }

  private getMockData(criteria: SearchCriteria): UnifiedFlight[] {
    return [
      {
        id: `kiwi-mock-1`,
        provider: this.name,
        airline: 'F9', // Frontier - Low cost carrier
        flightNumber: 'F9456',
        departure: { airport: criteria.origin, time: `${criteria.date}T15:00:00Z` },
        arrival: { airport: criteria.destination, time: `${criteria.date}T17:30:00Z` },
        durationMinutes: 150,
        price: { amount: 150.00, currency: 'USD' },
        pnrCandidate: 'KIWIMCK1'
      }
    ];
  }
}
