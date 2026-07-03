import apn from 'apn';
import { NotificationPayload } from '../types';

// In a real app, these would come from environment variables / secrets manager
const apnOptions = {
  token: {
    key: process.env.APN_KEY_PATH || 'path/to/APNsAuthKey_XXXXXXXXXX.p8',
    keyId: process.env.APN_KEY_ID || 'XXXXXXXXXX',
    teamId: process.env.APN_TEAM_ID || 'YYYYYYYYYY',
  },
  production: process.env.NODE_ENV === 'production',
};

// Lazy initialization of the APN provider
let apnProvider: apn.Provider | null = null;

export const sendAPN = async (deviceToken: string, payload: NotificationPayload): Promise<any> => {
  if (!apnProvider) {
    // We wrap this so we don't throw immediately in mock environments if keys are missing
    try {
      apnProvider = new apn.Provider(apnOptions);
    } catch (error) {
      console.warn('Failed to initialize APN provider (mocking for now):', error);
    }
  }

  const note = new apn.Notification();

  note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
  note.badge = 1;
  note.sound = 'ping.aiff';
  note.alert = {
    title: payload.title,
    body: payload.body,
  };
  
  // Set the topic (bundle ID of the app)
  note.topic = process.env.APN_BUNDLE_ID || 'com.example.travelapp';
  
  // Structure payload to support interactive actions and iMessage extensions
  // In `apn` types, category is not a property directly but often set via `note.payload` or it's `note.threadId` etc. Actually, it's `note.category` in some versions, but to satisfy TS we can cast it or use `(note as any).category = ...`. Or better, set it on the `note` directly if we cast.
  (note as any).category = payload.actionCategory || 'FLIGHT_UPDATE_INTERACTIVE';
  note.mutableContent = true; // Allows Service Extension to modify the content (e.g. download rich media)
  
  // Custom payload data payload for deep links and dynamic flight cards
  note.payload = {
    deepLink: payload.deepLink,
    flightInfo: payload.flightInfo,
    // A flag or sub-object specifically for an iMessage extension to intercept and render
    iMessageCardData: {
      template: 'FlightStatusCard',
      data: payload.flightInfo
    }
  };

  if (!apnProvider) {
    // Mock successful response if provider couldn't initialize (e.g. local dev without certs)
    console.log(`[MOCK APNS] Sending push to ${deviceToken}`);
    console.log(`[MOCK APNS] Payload:`, note);
    return { sent: [deviceToken], failed: [] };
  }

  const result = await apnProvider.send(note, deviceToken);
  
  if (result.failed.length > 0) {
    throw new Error(`APNs delivery failed for token: ${deviceToken}. Error: ${JSON.stringify(result.failed[0].response)}`);
  }

  return result;
};
