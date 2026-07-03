import { Pool } from 'pg';
import { Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

export enum SagaState {
  PENDING = 'PENDING',
  MANIFEST_ASSEMBLED = 'MANIFEST_ASSEMBLED',
  PRICING_REQUESTED = 'PRICING_REQUESTED',
  PRICING_CONFIRMED = 'PRICING_CONFIRMED',
  PAYMENT_REQUESTED = 'PAYMENT_REQUESTED',
  PAYMENT_AUTHORIZED = 'PAYMENT_AUTHORIZED',
  GDS_BOOKING_REQUESTED = 'GDS_BOOKING_REQUESTED',
  COMPLETED = 'COMPLETED',
  COMPENSATION_REFUND_REQUESTED = 'COMPENSATION_REFUND_REQUESTED',
  FAILED = 'FAILED'
}

export class BookingSagaOrchestrator {
  constructor(private db: Pool, private producer: Producer) {}

  async handleBookingRequested(data: any) {
    const bookingId = uuidv4();
    
    try {
      await this.db.query('BEGIN');
      
      // 1. Initialize Booking
      await this.db.query(
        'INSERT INTO bookings.flights (id, user_id, status, total_amount) VALUES ($1, $2, $3, $4)',
        [bookingId, data.user_id, 'PENDING', data.price]
      );

      // 2. Initialize Saga State
      await this.db.query(
        'INSERT INTO bookings.saga_states (booking_id, state) VALUES ($1, $2)',
        [bookingId, SagaState.PENDING]
      );

      // 3. Assemble Manifest (Querying auth schema directly)
      const userRes = await this.db.query('SELECT first_name, last_name FROM auth.users WHERE id = $1', [data.user_id]);
      const prefsRes = await this.db.query('SELECT * FROM auth.user_preferences WHERE user_id = $1', [data.user_id]);
      const loyaltyRes = await this.db.query('SELECT * FROM auth.loyalty_programs WHERE user_id = $1', [data.user_id]);
      
      const manifest = {
        primary_passenger: userRes.rows[0],
        preferences: prefsRes.rows[0],
        loyalty: loyaltyRes.rows
      };

      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, passenger_manifest = $2 WHERE booking_id = $3',
        [SagaState.MANIFEST_ASSEMBLED, JSON.stringify(manifest), bookingId]
      );

      await this.db.query('COMMIT');

      // 4. Request Repricing
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1 WHERE booking_id = $2',
        [SagaState.PRICING_REQUESTED, bookingId]
      );
      
      await this.producer.send({
        topic: 'offer-price-requested',
        messages: [{ value: JSON.stringify({ booking_id: bookingId, offer_id: data.offer_id, user_id: data.user_id }) }]
      });

    } catch (error: any) {
      await this.db.query('ROLLBACK');
      console.error('Failed to initialize saga for booking:', error);
      await this.failSaga(bookingId, error.message);
    }
  }

  async handleOfferPriceResponded(data: any) {
    const { booking_id, new_price, offer_id } = data;
    
    try {
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, offer_id = $2 WHERE booking_id = $3 AND state = $4',
        [SagaState.PRICING_CONFIRMED, offer_id, booking_id, SagaState.PRICING_REQUESTED]
      );
      
      // Update booking with the latest price
      await this.db.query(
        'UPDATE bookings.flights SET total_amount = $1 WHERE id = $2',
        [new_price, booking_id]
      );

      // Move to payment authorization
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1 WHERE booking_id = $2',
        [SagaState.PAYMENT_REQUESTED, booking_id]
      );

      await this.producer.send({
        topic: 'payment-requested',
        messages: [{ value: JSON.stringify({ booking_id, user_id: data.user_id, amount: new_price }) }]
      });
    } catch (error: any) {
      console.error(`Failed to process offer-price-responded for booking ${booking_id}:`, error);
      await this.failSaga(booking_id, error.message);
    }
  }

  async handlePaymentProcessed(data: any) {
    const { booking_id, user_id, payment_intent_id } = data;

    try {
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, payment_intent_id = $2 WHERE booking_id = $3 AND state = $4',
        [SagaState.PAYMENT_AUTHORIZED, payment_intent_id, booking_id, SagaState.PAYMENT_REQUESTED]
      );

      // Move to GDS Booking Submission
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1 WHERE booking_id = $2',
        [SagaState.GDS_BOOKING_REQUESTED, booking_id]
      );

      // Retrieve manifest and offer_id to send to GDS
      const sagaState = await this.db.query('SELECT passenger_manifest, offer_id FROM bookings.saga_states WHERE booking_id = $1', [booking_id]);
      
      await this.producer.send({
        topic: 'gds-booking-requested',
        messages: [{ 
          value: JSON.stringify({ 
            booking_id, 
            user_id, 
            offer_id: sagaState.rows[0].offer_id,
            manifest: sagaState.rows[0].passenger_manifest
          }) 
        }]
      });
    } catch (error: any) {
      console.error(`Failed to process payment-processed for booking ${booking_id}:`, error);
      await this.failSaga(booking_id, error.message);
    }
  }

  async handleGdsBookingConfirmed(data: any) {
    const { booking_id, user_id, pnr } = data;

    try {
      await this.db.query('BEGIN');

      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1 WHERE booking_id = $2 AND state = $3',
        [SagaState.COMPLETED, booking_id, SagaState.GDS_BOOKING_REQUESTED]
      );

      await this.db.query(
        'UPDATE bookings.flights SET status = $1, pnr = $2 WHERE id = $3',
        ['CONFIRMED', pnr, booking_id]
      );

      await this.db.query('COMMIT');

      await this.producer.send({
        topic: 'booking-confirmed',
        messages: [{ value: JSON.stringify({ booking_id, user_id, pnr }) }]
      });
      
      console.log(`Saga completed successfully for booking ${booking_id}`);
    } catch (error: any) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to process gds-booking-confirmed for booking ${booking_id}:`, error);
      // Even if our DB update fails, the GDS booking succeeded. We might need manual intervention here or retry.
    }
  }

  async handleGdsBookingFailed(data: any) {
    const { booking_id, user_id, reason } = data;

    try {
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, error_reason = $2 WHERE booking_id = $3',
        [SagaState.COMPENSATION_REFUND_REQUESTED, reason, booking_id]
      );

      const sagaState = await this.db.query('SELECT payment_intent_id FROM bookings.saga_states WHERE booking_id = $1', [booking_id]);
      
      await this.producer.send({
        topic: 'payment-refund-requested',
        messages: [{ 
          value: JSON.stringify({ 
            booking_id, 
            user_id, 
            payment_intent_id: sagaState.rows[0].payment_intent_id 
          }) 
        }]
      });
    } catch (error: any) {
      console.error(`Failed to process gds-booking-failed for booking ${booking_id}:`, error);
    }
  }

  async handlePaymentRefunded(data: any) {
    const { booking_id, user_id } = data;
    await this.failSaga(booking_id, 'GDS Booking failed, payment refunded.');
  }

  async failSaga(bookingId: string, reason: string) {
    try {
      await this.db.query('BEGIN');
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, error_reason = $2 WHERE booking_id = $3',
        [SagaState.FAILED, reason, bookingId]
      );
      await this.db.query(
        'UPDATE bookings.flights SET status = $1 WHERE id = $2',
        ['FAILED', bookingId]
      );
      await this.db.query('COMMIT');
      
      await this.producer.send({
        topic: 'booking-failed',
        messages: [{ value: JSON.stringify({ booking_id: bookingId, reason }) }]
      });
      console.log(`Saga failed for booking ${bookingId}: ${reason}`);
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to mark saga as failed for booking ${bookingId}:`, error);
    }
  }
}
