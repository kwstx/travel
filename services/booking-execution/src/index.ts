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

async function init() {
  await producer.connect();
  console.log('Connected to Kafka Producer');

  await consumer.connect();
  await consumer.subscribe({ topic: 'booking-requested', fromBeginning: false });
  await consumer.subscribe({ topic: 'payment-processed', fromBeginning: false });
  await consumer.subscribe({ topic: 'payment-failed', fromBeginning: false });
  console.log('Subscribed to booking topics');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) return;
      const data = JSON.parse(message.value.toString());
      console.log(`Received message on topic ${topic}:`, data);

      if (topic === 'booking-requested') {
        // Create pending booking in DB
        const result = await db.query(
          'INSERT INTO bookings.flights (user_id, status, total_amount) VALUES ($1, $2, $3) RETURNING id',
          [data.user_id, 'PENDING', data.price]
        );
        const bookingId = result.rows[0].id;
        
        // Publish to initiate payment (Saga step 1)
        await producer.send({
          topic: 'payment-requested',
          messages: [{ value: JSON.stringify({ booking_id: bookingId, user_id: data.user_id, amount: data.price }) }]
        });
      } else if (topic === 'payment-processed') {
        // Update booking status to CONFIRMED
        await db.query('UPDATE bookings.flights SET status = $1 WHERE id = $2', ['CONFIRMED', data.booking_id]);
        
        // Data Minimization: Purge transient booking artifacts after ticket issuance
        await db.query('DELETE FROM bookings.transient_artifacts WHERE booking_id = $1', [data.booking_id]);
        
        // Emit Booking Confirmed Event
        await producer.send({
          topic: 'booking-confirmed',
          messages: [{ value: JSON.stringify({ booking_id: data.booking_id, user_id: data.user_id }) }]
        });
      } else if (topic === 'payment-failed') {
         // Update booking status to FAILED
         await db.query('UPDATE bookings.flights SET status = $1 WHERE id = $2', ['FAILED', data.booking_id]);
         
         // Emit Booking Failed Event
         await producer.send({
           topic: 'booking-failed',
           messages: [{ value: JSON.stringify({ booking_id: data.booking_id, user_id: data.user_id, reason: data.reason }) }]
         });
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
