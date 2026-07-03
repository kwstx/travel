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

import { AggregatorService } from './services/AggregatorService';

const aggregatorService = new AggregatorService();

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

      const criteria = {
        origin: data.entities?.origin || 'JFK',
        destination: data.entities?.destination || 'LHR',
        date: data.entities?.date || '2026-08-01',
        passengers: data.entities?.passengers || 1
      };

      try {
        const aggregatedFlights = await aggregatorService.aggregateFlights(criteria);

        // Cache the results in Redis with a short TTL (e.g. 15 mins)
        const cacheKey = `flights:${data.user_id}:${data.session_id}`;
        await redisClient.set(cacheKey, JSON.stringify(aggregatedFlights), { EX: 900 });

        console.log(`Saved ${aggregatedFlights.length} flights for ${data.user_id} to cache`);
      } catch (error) {
        console.error('Error during flight aggregation:', error);
      }
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
