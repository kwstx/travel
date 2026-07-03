import { Pool } from 'pg';
import { Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

export enum SagaState {
  PROPOSED = 'PROPOSED',
  PRICED = 'PRICED',
  AUTHORIZED = 'AUTHORIZED',
  TICKETED = 'TICKETED',
  CONFIRMED = 'CONFIRMED',
  COMPENSATION_REFUND_REQUESTED = 'COMPENSATION_REFUND_REQUESTED',
  FAILED_TRANSIENT = 'FAILED_TRANSIENT',
  FAILED_PERMANENT = 'FAILED_PERMANENT'
}

export enum ErrorType {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT'
}

export class BookingSagaOrchestrator {
  constructor(private db: Pool, private producer: Producer) {}

  async handleBookingRequested(data: any) {
    const bookingId = uuidv4();
    
    try {
      await this.db.query('BEGIN');
      
      // 1. Initialize Booking
      await this.db.query(
        'INSERT INTO bookings.flights (id, user_id, status, total_amount, companion_ids) VALUES ($1, $2, $3, $4, $5)',
        [bookingId, data.user_id, 'PENDING', data.price, JSON.stringify(data.companion_ids || [])]
      );

      // 2. Assemble Manifest
      const userRes = await this.db.query('SELECT first_name, last_name FROM auth.users WHERE id = $1', [data.user_id]);
      const prefsRes = await this.db.query('SELECT * FROM auth.user_preferences WHERE user_id = $1', [data.user_id]);
      const loyaltyRes = await this.db.query('SELECT * FROM auth.loyalty_programs WHERE user_id = $1', [data.user_id]);
      
      const manifest: any = {
        primary_passenger: userRes.rows[0],
        preferences: prefsRes.rows[0],
        loyalty: loyaltyRes.rows,
        companions: []
      };

      if (data.companion_ids && data.companion_ids.length > 0) {
        const companionsRes = await this.db.query(
          'SELECT id, first_name, last_name, relationship FROM auth.companion_profiles WHERE id = ANY($1) AND user_id = $2',
          [data.companion_ids, data.user_id]
        );
        if (companionsRes.rows.length !== data.companion_ids.length) {
          throw new Error('One or more companion profiles not found or not authorized for this user.');
        }
        manifest.companions = companionsRes.rows;
      }

      // 3. Initialize Saga State as PROPOSED
      await this.db.query(
        'INSERT INTO bookings.saga_states (booking_id, state, passenger_manifest) VALUES ($1, $2, $3)',
        [bookingId, SagaState.PROPOSED, JSON.stringify(manifest)]
      );

      await this.db.query('COMMIT');

      // 4. Request Repricing
      await this.producer.send({
        topic: 'offer-price-requested',
        messages: [{ value: JSON.stringify({ booking_id: bookingId, offer_id: data.offer_id, user_id: data.user_id }) }]
      });

    } catch (error: any) {
      await this.db.query('ROLLBACK');
      console.error('Failed to initialize saga for booking:', error);
      await this.failSaga(bookingId, ErrorType.TRANSIENT, error.message, 'An internal error occurred while initializing the booking. Please try again.');
    }
  }

  async handleOfferPriceResponded(data: any) {
    const { booking_id, new_price, offer_id, error } = data;
    
    if (error) {
      await this.failSaga(booking_id, ErrorType.PERMANENT, error, 'The flight price is no longer available or has changed significantly. Please search for new flights.');
      return;
    }

    try {
      await this.db.query('BEGIN');
      
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, offer_id = $2 WHERE booking_id = $3 AND state = $4',
        [SagaState.PRICED, offer_id, booking_id, SagaState.PROPOSED]
      );
      
      await this.db.query(
        'UPDATE bookings.flights SET total_amount = $1 WHERE id = $2',
        [new_price, booking_id]
      );

      await this.db.query('COMMIT');

      // Move to payment authorization
      await this.producer.send({
        topic: 'payment-requested',
        messages: [{ value: JSON.stringify({ booking_id, user_id: data.user_id, amount: new_price }) }]
      });
    } catch (err: any) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to process offer-price-responded for booking ${booking_id}:`, err);
      await this.failSaga(booking_id, ErrorType.TRANSIENT, err.message, 'Encountered a temporary system issue while verifying the price. We are retrying.');
    }
  }

  async handlePaymentProcessed(data: any) {
    const { booking_id, user_id, payment_intent_id } = data;

    try {
      await this.db.query('BEGIN');
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, payment_intent_id = $2 WHERE booking_id = $3 AND state = $4',
        [SagaState.AUTHORIZED, payment_intent_id, booking_id, SagaState.PRICED]
      );
      await this.db.query('COMMIT');

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
      await this.db.query('ROLLBACK');
      console.error(`Failed to process payment-processed for booking ${booking_id}:`, error);
      await this.failSaga(booking_id, ErrorType.TRANSIENT, error.message, 'Temporary issue connecting to the booking system. We will retry your booking.');
    }
  }

  async handlePaymentFailed(data: any) {
    const { booking_id, reason } = data;
    await this.failSaga(booking_id, ErrorType.PERMANENT, reason, 'Payment was declined. Please verify your payment method or try a different card.');
  }

  async handleGdsBookingConfirmed(data: any) {
    const { booking_id, user_id, pnr } = data;

    try {
      await this.db.query('BEGIN');

      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1 WHERE booking_id = $2 AND state = $3',
        [SagaState.TICKETED, booking_id, SagaState.AUTHORIZED]
      );

      await this.db.query(
        'UPDATE bookings.flights SET status = $1, pnr = $2 WHERE id = $3',
        ['TICKETED', JSON.stringify(Array.isArray(pnr) ? pnr : [pnr]), booking_id]
      );

      await this.db.query('COMMIT');

      // Emit events for downstream actions
      const payload = JSON.stringify({ booking_id, user_id, pnr });
      await this.producer.send({
        topic: 'itinerary-storage-requested',
        messages: [{ value: payload }]
      });
      await this.producer.send({
        topic: 'notification-scheduling-requested',
        messages: [{ value: payload }]
      });

      console.log(`Booking ${booking_id} TICKETED successfully. Awaiting downstream confirmation.`);
    } catch (error: any) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to process gds-booking-confirmed for booking ${booking_id}:`, error);
      // GDS booking succeeded but local DB failed, needs manual intervention or transient retry
      await this.failSaga(booking_id, ErrorType.TRANSIENT, error.message, 'Your booking is confirmed with the airline, but we had an issue updating your itinerary. We will sync it shortly.');
    }
  }

  async handleGdsBookingFailed(data: any) {
    const { booking_id, user_id, reason, error_type = ErrorType.PERMANENT } = data;

    try {
      await this.db.query('BEGIN');
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, error_reason = $2 WHERE booking_id = $3',
        [SagaState.COMPENSATION_REFUND_REQUESTED, reason, booking_id]
      );
      await this.db.query('COMMIT');

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
      
      const userMessage = error_type === ErrorType.TRANSIENT ? 
        'We encountered a temporary issue connecting to the airline. We have cancelled the request and will refund your payment.' :
        'The airline could not process this booking with the provided details. We will refund your payment.';
        
      // Also emit a failure event immediately for the UI to know it's failing
      await this.failSaga(booking_id, error_type, reason, userMessage);
    } catch (error: any) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to process gds-booking-failed for booking ${booking_id}:`, error);
    }
  }

  async handlePaymentRefunded(data: any) {
    const { booking_id } = data;
    console.log(`Payment successfully refunded for booking ${booking_id}`);
    // Saga state is already handled by the failSaga or compensation workflow
  }

  async handleItineraryStored(data: any) {
    const { booking_id } = data;
    try {
      await this.db.query('BEGIN');
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1 WHERE booking_id = $2 AND state = $3',
        [SagaState.CONFIRMED, booking_id, SagaState.TICKETED]
      );
      await this.db.query(
        'UPDATE bookings.flights SET status = $1 WHERE id = $2',
        ['CONFIRMED', booking_id]
      );
      await this.db.query('COMMIT');
      console.log(`Saga fully COMPLETED/CONFIRMED for booking ${booking_id}`);
    } catch (error: any) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to mark saga as confirmed for booking ${booking_id}:`, error);
    }
  }

  async failSaga(bookingId: string, errorType: ErrorType, reason: string, recoveryMessage: string) {
    const state = errorType === ErrorType.TRANSIENT ? SagaState.FAILED_TRANSIENT : SagaState.FAILED_PERMANENT;
    
    try {
      await this.db.query('BEGIN');
      await this.db.query(
        'UPDATE bookings.saga_states SET state = $1, error_reason = $2 WHERE booking_id = $3',
        [state, reason, bookingId]
      );
      await this.db.query(
        'UPDATE bookings.flights SET status = $1 WHERE id = $2',
        ['FAILED', bookingId]
      );
      await this.db.query('COMMIT');
      
      const failTopic = errorType === ErrorType.TRANSIENT ? 'booking-failed-transient' : 'booking-failed-permanent';
      
      await this.producer.send({
        topic: failTopic,
        messages: [{ value: JSON.stringify({ booking_id: bookingId, reason, recovery_message: recoveryMessage }) }]
      });
      console.log(`Saga failed (${errorType}) for booking ${bookingId}: ${reason}`);
    } catch (error) {
      await this.db.query('ROLLBACK');
      console.error(`Failed to mark saga as failed for booking ${bookingId}:`, error);
    }
  }
}
