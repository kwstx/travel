import { DisruptionOrchestrator } from './orchestrator';

async function test() {
    const orchestrator = new DisruptionOrchestrator();
    
    await orchestrator.handleDisruptionEvent({
        pnr: 'TEST1234',
        userId: 'user_001',
        flightId: 'flight_123',
        reason: 'weather'
    });
}

test().catch(console.error);
