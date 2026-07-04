import { BookingSagaOrchestrator, SagaState, ErrorType } from './saga';

class MockPool {
  queries: any[] = [];
  async query(text: string, params?: any[]) {
    this.queries.push({ text, params });
    if (text.includes('SELECT passenger_manifest, offer_id FROM bookings.saga_states')) {
      return { rows: [{ passenger_manifest: { companions: [] }, offer_id: 'offer_123' }] };
    }
    if (text.includes('SELECT payment_intent_id FROM bookings.saga_states')) {
      return { rows: [{ payment_intent_id: 'pi_12345' }] };
    }
    return { rows: [] };
  }
}

class MockProducer {
  messages: any[] = [];
  async send(payload: any) {
    this.messages.push(payload);
  }
}

async function testSuccessPath() {
  console.log('--- Running Success Path (Free Rebooking) ---');
  const db = new MockPool();
  const producer = new MockProducer();
  const orchestrator = new BookingSagaOrchestrator(db as any, producer as any);

  // 1. Rebooking Requested (Free)
  const rebookingData = {
    original_pnr: 'XYZ123',
    new_offer_id: 'offer_free',
    user_id: 'user_001',
    price_difference: 0
  };
  await orchestrator.handleRebookingRequested(rebookingData);

  // Verify GDS Rebooking Requested
  const gdsReq = producer.messages.find(m => m.topic === 'gds-rebooking-requested');
  if (!gdsReq) throw new Error('Missing gds-rebooking-requested message');
  const gdsPayload = JSON.parse(gdsReq.messages[0].value);
  const bookingId = gdsPayload.booking_id;

  // 2. GDS Booking Confirmed (Mocking GDS response)
  await orchestrator.handleGdsBookingConfirmed({
    booking_id: bookingId,
    user_id: 'user_001',
    pnr: 'NEWPNR'
  });

  // Verify Itinerary Storage Requested
  const itinReq = producer.messages.find(m => m.topic === 'itinerary-storage-requested');
  if (!itinReq) throw new Error('Missing itinerary-storage-requested message');

  // 3. Itinerary Stored (Completes Saga)
  await orchestrator.handleItineraryStored({ booking_id: bookingId });

  // Verify DB state is CONFIRMED
  const confirmedQuery = db.queries.find(q => 
    q.text.includes('UPDATE bookings.saga_states SET state = $1') && q.params[0] === SagaState.CONFIRMED
  );
  if (!confirmedQuery) throw new Error('Saga state was not updated to CONFIRMED');
  console.log('Success Path verified successfully!\n');
}

async function testFailurePath() {
  console.log('--- Running Failure Path (Paid Rebooking Compensation) ---');
  const db = new MockPool();
  const producer = new MockProducer();
  const orchestrator = new BookingSagaOrchestrator(db as any, producer as any);

  // 1. Rebooking Requested (Paid)
  const rebookingData = {
    original_pnr: 'XYZ123',
    new_offer_id: 'offer_paid',
    user_id: 'user_001',
    price_difference: 50.00
  };
  await orchestrator.handleRebookingRequested(rebookingData);

  // Verify Payment Requested
  const payReq = producer.messages.find(m => m.topic === 'payment-requested');
  if (!payReq) throw new Error('Missing payment-requested message');
  const bookingId = JSON.parse(payReq.messages[0].value).booking_id;

  // 2. Payment Processed
  await orchestrator.handlePaymentProcessed({
    booking_id: bookingId,
    user_id: 'user_001',
    payment_intent_id: 'pi_12345'
  });

  // Verify GDS Booking Requested
  const gdsReq = producer.messages.find(m => m.topic === 'gds-booking-requested');
  if (!gdsReq) throw new Error('Missing gds-booking-requested message');

  // 3. GDS Booking Failed (Midway failure)
  await orchestrator.handleGdsBookingFailed({
    booking_id: bookingId,
    user_id: 'user_001',
    reason: 'GDS System Timeout',
    error_type: ErrorType.TRANSIENT
  });

  // Verify Compensation / Refund Requested
  const refundReq = producer.messages.find(m => m.topic === 'payment-refund-requested');
  if (!refundReq) throw new Error('Missing payment-refund-requested message (Compensation failed)');
  
  const refundPayload = JSON.parse(refundReq.messages[0].value);
  if (refundPayload.payment_intent_id !== 'pi_12345') {
    throw new Error('Refund requested for wrong payment intent');
  }

  // Verify Saga State transitions
  const compQuery = db.queries.find(q => 
    q.text.includes('UPDATE bookings.saga_states SET state = $1') && q.params[0] === SagaState.COMPENSATION_REFUND_REQUESTED
  );
  if (!compQuery) throw new Error('Saga state was not updated to COMPENSATION_REFUND_REQUESTED');

  const failQuery = db.queries.find(q => 
    q.text.includes('UPDATE bookings.saga_states SET state = $1, error_reason = $2') && q.params[0] === SagaState.FAILED_TRANSIENT
  );
  if (!failQuery) throw new Error('Saga state was not ultimately marked as FAILED');

  console.log('Failure Path verified successfully!\n');
}

async function runAll() {
  try {
    await testSuccessPath();
    await testFailurePath();
    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runAll();
