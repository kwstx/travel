import { NotificationPayload, UserPreferences, DispatchResult, Channel } from './types';
import { sendAPN } from './providers/apns';
import { sendSMS } from './providers/twilio';
import { sendEmail } from './providers/email';

/**
 * Dispatches a notification to the user based on their preferences.
 * Tries channels in the order specified in preferences.preferredChannels.
 * Stops as soon as one channel succeeds.
 */
export const dispatchNotification = async (
  payload: NotificationPayload,
  preferences: UserPreferences
): Promise<DispatchResult[]> => {
  const results: DispatchResult[] = [];
  
  // Always ensure 'apns' is at the top if it's supported and configured,
  // as per the requirement: "primarily through Apple Push Notification Service (APNs)"
  // Though for flexibility, we respect the preferences array if they explicitly opted out.
  // But let's assume the preferences reflect the fallback strategy.
  
  for (const channel of preferences.preferredChannels) {
    let success = false;
    let providerResponse: any = null;
    let error: any = null;

    try {
      console.log(`[Dispatcher] Attempting to send via ${channel}...`);
      switch (channel) {
        case 'apns':
          if (!preferences.apnsDeviceToken) {
            throw new Error('APNs device token not provided in preferences.');
          }
          providerResponse = await sendAPN(preferences.apnsDeviceToken, payload);
          success = true;
          break;
        
        case 'sms':
          if (!preferences.phoneNumber) {
            throw new Error('Phone number not provided in preferences.');
          }
          providerResponse = await sendSMS(preferences.phoneNumber, payload);
          success = true;
          break;
          
        case 'email':
          if (!preferences.emailAddress) {
            throw new Error('Email address not provided in preferences.');
          }
          providerResponse = await sendEmail(preferences.emailAddress, payload);
          success = true;
          break;
          
        default:
          throw new Error(`Unsupported channel: ${channel}`);
      }
    } catch (e: any) {
      console.error(`[Dispatcher] Failed to send via ${channel}: ${e.message}`);
      error = e;
    }

    results.push({
      success,
      channelUsed: channel,
      providerResponse,
      error
    });

    // If successful, we do not need to fallback to the next channel for THIS specific notification.
    // The requirement mentions "Fallback channels (SMS via Twilio, email) ensure delivery redundancy".
    // Redundancy usually means if primary fails, use secondary.
    if (success) {
      console.log(`[Dispatcher] Successfully sent via ${channel}. Stopping fallback sequence.`);
      break;
    }
  }

  return results;
};
