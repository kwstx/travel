import { FlightProvider, SearchCriteria } from '../providers/FlightProvider';
import { AmadeusProvider } from '../providers/AmadeusProvider';
import { DuffelProvider } from '../providers/DuffelProvider';
import { KiwiProvider } from '../providers/KiwiProvider';
import { NormalizerService } from './NormalizerService';
import { DeduplicationService } from './DeduplicationService';
import { EnrichmentService } from './EnrichmentService';
import { UnifiedFlight } from '../models/UnifiedFlight';

export class AggregatorService {
  private providers: FlightProvider[];
  private normalizer: NormalizerService;
  private deduplicator: DeduplicationService;
  private enricher: EnrichmentService;

  constructor() {
    this.providers = [
      new AmadeusProvider(),
      new DuffelProvider(),
      new KiwiProvider()
    ];
    this.normalizer = new NormalizerService();
    this.deduplicator = new DeduplicationService();
    this.enricher = new EnrichmentService();
  }

  public async aggregateFlights(criteria: SearchCriteria): Promise<UnifiedFlight[]> {
    console.log(`Starting flight aggregation for ${criteria.origin} to ${criteria.destination}`);

    // Call all providers concurrently
    const providerPromises = this.providers.map(provider => 
      provider.searchFlights(criteria).catch(error => {
        console.error(`Provider ${provider.name} failed:`, error);
        return []; // Return empty array on failure so other providers can succeed
      })
    );

    const providerResults = await Promise.all(providerPromises);
    
    // Flatten the results
    const allFlights = providerResults.flat();
    console.log(`Retrieved ${allFlights.length} total flights from providers`);

    // Normalize
    const normalizedFlights = this.normalizer.normalize(allFlights);

    // Deduplicate
    const deduplicatedFlights = this.deduplicator.deduplicate(normalizedFlights);
    console.log(`Remaining flights after deduplication: ${deduplicatedFlights.length}`);

    // Enrich
    const enrichedFlights = this.enricher.enrich(deduplicatedFlights);

    // Sort by price (lowest first)
    enrichedFlights.sort((a, b) => a.price.amount - b.price.amount);

    return enrichedFlights;
  }
}
