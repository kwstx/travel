import { Kafka } from 'kafkajs';
import { FlightMonitor } from './monitor';

const kafka = new Kafka({
  clientId: 'flight-monitoring-service',
  brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
});

const consumer = kafka.consumer({ groupId: 'flight-monitoring-group' });
const monitor = new FlightMonitor();

async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'booking-confirmed', fromBeginning: false });

  console.log('Flight Monitoring Service started, listening for booking-confirmed events...');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        if (!message.value) return;
        
        const payload = JSON.parse(message.value.toString());
        // Expected payload from booking-execution service
        // { userId, bookingId, flightId, departureTime: ISOString }
        
        const userId = payload.userId;
        const flightId = payload.flightId || 'UA123'; // fallback for mock
        const departureTime = payload.departureTime ? new Date(payload.departureTime) : new Date(Date.now() + 2 * 60 * 60 * 1000); // default +2h

        if (userId && flightId) {
          monitor.startMonitoring(userId, flightId, departureTime);
        }
      } catch (err: any) {
        console.error('Error processing message:', err.message);
      }
    },
  });
}

run().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await consumer.disconnect();
  process.exit(0);
});
