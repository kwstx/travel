import express from 'express';
import { Kafka } from 'kafkajs';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const kafka = new Kafka({
  clientId: 'flight-aggregator',
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: 'flight-aggregator-group' });
const producer = kafka.producer();

const redisClient = createClient({ url: REDIS_URL });

async function init() {
  await redisClient.connect();
  console.log('Connected to Redis');

  await producer.connect();
  console.log('Connected to Kafka Producer');

  await consumer.connect();
  await consumer.subscribe({ topic: 'flight-search-requested', fromBeginning: false });
  console.log('Subscribed to flight-search-requested topic');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      const data = JSON.parse(message.value.toString());
      console.log('Received flight search request:', data);

      // Simulate fetching from GDS (Amadeus/Sabre)
      const mockFlights = [
        { id: 'FL123', airline: 'Delta', price: 450.00, departure: data.entities?.date || '2026-08-01', pnr_candidate: 'DELTA123' },
        { id: 'FL456', airline: 'United', price: 420.00, departure: data.entities?.date || '2026-08-01', pnr_candidate: 'UNIT456' }
      ];

      // Cache the results in Redis with a short TTL (e.g. 15 mins)
      const cacheKey = `flights:${data.user_id}:${data.session_id}`;
      await redisClient.set(cacheKey, JSON.stringify(mockFlights), { EX: 900 });

      // In a real system, we'd send a message back or notify the conversational service that results are ready.
      // For now, let's just log it.
      console.log(`Saved flights for ${data.user_id} to cache`);
    }
  });
}

init().catch(console.error);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flight-aggregator' });
});

app.listen(PORT, () => {
  console.log(`Flight Aggregator Service running on port ${PORT}`);
});
