import axios from 'axios';
import { Kafka } from 'kafkajs';

export interface RawFlightStatus {
  flight_number: string;
  airline_code: string;
  status_code: string; // e.g. "SCH", "DEL", "CAN", "GTC"
  delay_minutes: number;
  gate: string;
  departure_time: string;
}

export interface FlightStatusEvent {
  status: 'ON_TIME' | 'DELAYED' | 'CANCELLED' | 'GATE_CHANGE';
  delay_minutes: number;
  gate: string;
  flight_id: string;
}

export interface NotificationPreferences {
  user_id: string;
  alert_on_delay_minutes: number;
  alert_on_gate_change: boolean;
  alert_on_cancellation: boolean;
}

const kafka = new Kafka({
  clientId: 'flight-monitoring-processor',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
});

const producer = kafka.producer();

export class EventProcessor {
  private isProducerConnected = false;

  async connect() {
    if (!this.isProducerConnected) {
      await producer.connect();
      this.isProducerConnected = true;
    }
  }

  normalizeStatus(raw: RawFlightStatus): FlightStatusEvent {
    let status: FlightStatusEvent['status'] = 'ON_TIME';
    if (raw.status_code === 'CAN') status = 'CANCELLED';
    else if (raw.status_code === 'DEL' || raw.delay_minutes > 0) status = 'DELAYED';
    else if (raw.status_code === 'GTC') status = 'GATE_CHANGE';

    return {
      status,
      delay_minutes: raw.delay_minutes,
      gate: raw.gate,
      flight_id: `${raw.airline_code}${raw.flight_number}`,
    };
  }

  async fetchUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const url = `http://localhost:8000/users/${userId}/preferences/notifications`;
      const response = await axios.get(url);
      return response.data;
    } catch (err: any) {
      console.warn(`Failed to fetch preferences for user ${userId}:`, err.message);
      return null;
    }
  }

  async evaluateAndNotify(userId: string, flightId: string, oldStatus: FlightStatusEvent | null, newStatus: FlightStatusEvent) {
    const prefs = await this.fetchUserPreferences(userId);
    if (!prefs) return;

    let shouldAlert = false;
    let alertReason = '';

    if (prefs.alert_on_cancellation && newStatus.status === 'CANCELLED') {
      shouldAlert = true;
      alertReason = 'Flight cancelled';
    } else if (prefs.alert_on_delay_minutes > 0 && newStatus.status === 'DELAYED' && newStatus.delay_minutes >= prefs.alert_on_delay_minutes) {
      shouldAlert = true;
      alertReason = `Flight delayed by ${newStatus.delay_minutes} minutes`;
    } else if (prefs.alert_on_gate_change && newStatus.status === 'GATE_CHANGE') {
      // Check if gate actually changed from old status
      if (!oldStatus || oldStatus.gate !== newStatus.gate) {
        shouldAlert = true;
        alertReason = `Gate changed to ${newStatus.gate}`;
      }
    }

    if (shouldAlert) {
      await this.connect();
      const payload = {
        userId,
        flightId,
        alertReason,
        status: newStatus,
        timestamp: new Date().toISOString(),
      };
      
      console.log(`[ALERT] Publishing notification-requested for user ${userId}, flight ${flightId}: ${alertReason}`);
      await producer.send({
        topic: 'notification-requested',
        messages: [{ value: JSON.stringify(payload) }],
      });
    }
  }
}
