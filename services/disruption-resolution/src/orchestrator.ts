import { v4 as uuidv4 } from 'uuid';

export interface DisruptedFlightEvent {
    pnr: string;
    userId: string;
    flightId: string;
    reason: string;
    delayMinutes?: number;
}


export interface FlightAlternative {
    id: string;
    airline: string;
    departureTime: Date;
    priceDifference: number;
    score: number;
    isHeld: boolean;
    holdExpiresAt?: Date;
}

export class DisruptionOrchestrator {
    // Mock dependencies
    private notificationsServiceUrl = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3005';
    private flightAggregatorUrl = process.env.FLIGHT_AGGREGATOR_URL || 'http://localhost:3002';
    
    public async handleDisruptionEvent(event: DisruptedFlightEvent) {
        console.log(`[DisruptionOrchestrator] Handling disruption for PNR ${event.pnr}`);
        
        // 1. Fetch alternatives from Aggregator
        const alternatives = await this.discoverAlternatives(event.flightId);
        
        // 2. Score alternatives via Intelligence Engine (mocked locally here)
        const scoredAlternatives = this.scoreAlternatives(alternatives, event.userId);
        
        // 3. Attempt to place soft holds on top 2 options
        const optionsWithHolds = await this.placeSoftHolds(scoredAlternatives.slice(0, 2), event.pnr);
        
        // 4. Send Interactive Decision Matrix to user
        await this.dispatchInteractiveNotification(event.userId, event.pnr, optionsWithHolds);
    }

    private async discoverAlternatives(originalFlightId: string): Promise<FlightAlternative[]> {
        console.log(`[DisruptionOrchestrator] Searching flight aggregator for replacement flights for ${originalFlightId}`);
        // Mocking aggregator response
        return [
            { id: uuidv4(), airline: 'Delta', departureTime: new Date(Date.now() + 3600000 * 2), priceDifference: 0, score: 0, isHeld: false },
            { id: uuidv4(), airline: 'United', departureTime: new Date(Date.now() + 3600000 * 3), priceDifference: 50, score: 0, isHeld: false },
            { id: uuidv4(), airline: 'American', departureTime: new Date(Date.now() + 3600000 * 4), priceDifference: 0, score: 0, isHeld: false }
        ];
    }

    private scoreAlternatives(alternatives: FlightAlternative[], userId: string): FlightAlternative[] {
        // Mocking intelligence engine scoring
        // Higher score is better
        const scored = alternatives.map(alt => ({
            ...alt,
            score: alt.priceDifference === 0 ? 100 : 50
        })).sort((a, b) => b.score - a.score);
        console.log(`[DisruptionOrchestrator] Alternatives sorted and scored correctly:`, scored.map(s => ({ airline: s.airline, score: s.score })));
        return scored;
    }

    private async placeSoftHolds(alternatives: FlightAlternative[], pnr: string): Promise<FlightAlternative[]> {
        // Mocking GDS/NDC hold logic
        // We hold it for 30 minutes
        const holdDuration = 30 * 60 * 1000;
        console.log(`[DisruptionOrchestrator] Mock GDS/NDC layer issuing temporary soft holds for PNR ${pnr}`);
        return alternatives.map(alt => ({
            ...alt,
            isHeld: true,
            holdExpiresAt: new Date(Date.now() + holdDuration)
        }));
    }

    private async dispatchInteractiveNotification(userId: string, pnr: string, options: FlightAlternative[]) {
        console.log(`[DisruptionOrchestrator] Dispatching Interactive Decision Matrix to user ${userId} for PNR ${pnr}`);
        
        const payload = {
            type: 'DISRUPTION_INTERACTIVE_DECISION',
            userId,
            pnr,
            message: 'Your flight was disrupted. We have found alternatives for you.',
            options: [
                ...options.map(opt => ({
                    id: opt.id,
                    description: `${opt.airline} departing at ${opt.departureTime.toISOString()} (${opt.priceDifference === 0 ? 'Free' : '+$' + opt.priceDifference})`,
                    actionUrl: `/api/disruption/decision?pnr=${pnr}&optionId=${opt.id}`
                })),
                {
                    id: 'cancel_refund',
                    description: 'Cancel trip and request full refund',
                    actionUrl: `/api/disruption/decision?pnr=${pnr}&optionId=cancel_refund`
                }
            ]
        };
        
        // In reality, this would be an HTTP POST to the notifications service or a Kafka message
        console.log(JSON.stringify(payload, null, 2));
    }
}
