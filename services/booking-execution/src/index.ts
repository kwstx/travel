import express from 'express';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'travel_user',
  password: process.env.DB_PASSWORD || 'travel_password',
  database: process.env.DB_NAME || 'travel_db',
});

const kafka = new Kafka({
  clientId: 'booking-execution',
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: 'booking-execution-group' });
const producer = kafka.producer();

import { BookingSagaOrchestrator } from './saga';

async function init() {
  await producer.connect();
  console.log('Connected to Kafka Producer');

  await consumer.connect();
  
  const topics = [
    'booking-requested',
    'offer-price-responded',
    'payment-processed',
    'payment-failed',
    'gds-booking-confirmed',
    'gds-booking-failed',
    'payment-refunded'
  ];

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
  
  console.log('Subscribed to booking topics');

  const orchestrator = new BookingSagaOrchestrator(db, producer);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      const data = JSON.parse(message.value.toString());
      console.log(`Received message on topic ${topic}:`, data);

      switch (topic) {
        case 'booking-requested':
          await orchestrator.handleBookingRequested(data);
          break;
        case 'offer-price-responded':
          await orchestrator.handleOfferPriceResponded(data);
          break;
        case 'payment-processed':
          await orchestrator.handlePaymentProcessed(data);
          break;
        case 'payment-failed':
          await orchestrator.failSaga(data.booking_id, data.reason || 'Payment failed');
          break;
        case 'gds-booking-confirmed':
          await orchestrator.handleGdsBookingConfirmed(data);
          break;
        case 'gds-booking-failed':
          await orchestrator.handleGdsBookingFailed(data);
          break;
        case 'payment-refunded':
          await orchestrator.handlePaymentRefunded(data);
          break;
        default:
          console.warn(`Unhandled topic: ${topic}`);
      }
    }
  });
}

init().catch(console.error);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'booking-execution' });
});

app.listen(PORT, () => {
  console.log(`Booking Execution Service running on port ${PORT}`);
});
