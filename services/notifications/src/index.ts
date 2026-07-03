import { dispatchNotification } from './dispatcher';
import { NotificationPayload, UserPreferences } from './types';

async function runMockSimulation() {
  console.log('--- Starting Notification Dispatch Simulation ---\n');

  const payload: NotificationPayload = {
    title: 'Flight Gate Change',
    body: 'Your flight UA123 has changed to Gate B12.',
    flightInfo: {
      flightNumber: 'UA123',
      scheduledDepartureTime: '2026-07-04T10:00:00Z',
      gate: 'B12',
      status: 'GATE_CHANGE'
    },
    deepLink: 'myapp://flight/UA123',
    actionCategory: 'FLIGHT_GATE_CHANGE'
  };

  const userPrefWithNoAPN: UserPreferences = {
    userId: 'user_123',
    // Prefers APNs, but device token is missing, so it should fallback to SMS
    preferredChannels: ['apns', 'sms', 'email'],
    phoneNumber: '+19876543210',
    emailAddress: 'user123@example.com'
  };

  console.log('Scenario 1: User prefers APNs, but token is missing. Should fallback to SMS.');
  const results1 = await dispatchNotification(payload, userPrefWithNoAPN);
  console.log('Result 1:', JSON.stringify(results1, null, 2));

  console.log('\n------------------------------------------------\n');

  const userPrefWithAll: UserPreferences = {
    userId: 'user_456',
    // Has all tokens/info, should succeed on first try (apns)
    preferredChannels: ['apns', 'email'],
    apnsDeviceToken: 'mock_device_token_abc123',
    emailAddress: 'user456@example.com'
  };

  console.log('Scenario 2: User has APNs token. Should succeed via APNs and stop.');
  const results2 = await dispatchNotification(payload, userPrefWithAll);
  console.log('Result 2:', JSON.stringify(results2, null, 2));

  console.log('\n--- Simulation Complete ---');
}

if (require.main === module) {
  runMockSimulation().catch(console.error);
}
