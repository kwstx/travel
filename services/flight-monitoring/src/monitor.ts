import { EventProcessor, RawFlightStatus, FlightStatusEvent } from './processor';

export class FlightMonitor {
  private activeJobs: Map<string, NodeJS.Timeout> = new Map();
  private flightStatuses: Map<string, FlightStatusEvent> = new Map();
  private processor: EventProcessor;

  constructor() {
    this.processor = new EventProcessor();
  }

  startMonitoring(userId: string, flightId: string, departureTime: Date) {
    if (this.activeJobs.has(flightId)) {
      console.log(`Already monitoring flight ${flightId}`);
      return;
    }

    console.log(`Starting adaptive monitoring for flight ${flightId} (departure: ${departureTime.toISOString()})`);
    this.scheduleNextPoll(userId, flightId, departureTime);
  }

  stopMonitoring(flightId: string) {
    const timer = this.activeJobs.get(flightId);
    if (timer) {
      clearTimeout(timer);
      this.activeJobs.delete(flightId);
      console.log(`Stopped monitoring flight ${flightId}`);
    }
  }

  private scheduleNextPoll(userId: string, flightId: string, departureTime: Date) {
    const now = new Date();
    const timeToDepartureHours = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    let intervalMs = 60 * 60 * 1000; // default 1 hour
    
    if (timeToDepartureHours < 0) {
      console.log(`Flight ${flightId} has departed. Stopping monitoring.`);
      this.stopMonitoring(flightId);
      return;
    } else if (timeToDepartureHours <= 1) {
      intervalMs = 5 * 60 * 1000; // 5 minutes
    } else if (timeToDepartureHours <= 4) {
      intervalMs = 15 * 60 * 1000; // 15 minutes
    }

    // Since this is a test/mock setup, let's artificially speed up the polling so we can see it run
    intervalMs = 5000; // 5 seconds for testing purposes

    const timer = setTimeout(async () => {
      await this.pollFlightStatus(userId, flightId, departureTime);
      this.scheduleNextPoll(userId, flightId, departureTime);
    }, intervalMs);

    this.activeJobs.set(flightId, timer);
  }

  private async pollFlightStatus(userId: string, flightId: string, departureTime: Date) {
    // Mock Provider Call
    const rawStatus = this.mockFlightAwareProvider(flightId, departureTime);
    
    // Normalize
    const newStatus = this.processor.normalizeStatus(rawStatus);
    const oldStatus = this.flightStatuses.get(flightId) || null;

    // Evaluate
    await this.processor.evaluateAndNotify(userId, flightId, oldStatus, newStatus);
    
    // Update local state
    this.flightStatuses.set(flightId, newStatus);
  }

  private mockFlightAwareProvider(flightId: string, departureTime: Date): RawFlightStatus {
    const rand = Math.random();
    let code = 'SCH'; // Scheduled
    let delay = 0;
    let gate = 'A1';

    if (rand > 0.95) {
      code = 'CAN';
    } else if (rand > 0.7) {
      code = 'DEL';
      delay = Math.floor(Math.random() * 120) + 15; // 15 to 135 mins
    } else if (rand > 0.5) {
      code = 'GTC';
      gate = `B${Math.floor(Math.random() * 20)}`;
    }

    return {
      flight_number: flightId.replace(/[a-zA-Z]/g, ''),
      airline_code: flightId.replace(/[0-9]/g, ''),
      status_code: code,
      delay_minutes: delay,
      gate: gate,
      departure_time: departureTime.toISOString(),
    };
  }
}
