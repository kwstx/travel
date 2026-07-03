import twilio from 'twilio';
import { NotificationPayload } from '../types';

const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC_mock_sid_xxxxxxxxxxxxxxxxxxxxxxx';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'mock_auth_token_xxxxxxxxxxxxxxx';
const fromNumber = process.env.TWILIO_FROM_NUMBER || '+1234567890';

// Lazy initialization
let client: twilio.Twilio | null = null;

export const sendSMS = async (phoneNumber: string, payload: NotificationPayload): Promise<any> => {
  if (!client) {
    if (process.env.TWILIO_ACCOUNT_SID) {
      client = twilio(accountSid, authToken);
    }
  }

  const messageBody = `Flight Update: ${payload.flightInfo.flightNumber} is ${payload.flightInfo.status}. ` +
    `Departure: ${payload.flightInfo.updatedDepartureTime || payload.flightInfo.scheduledDepartureTime}. ` +
    (payload.flightInfo.gate ? `Gate: ${payload.flightInfo.gate}. ` : '') +
    `Details: ${payload.deepLink}`;

  if (!client) {
    console.log(`[MOCK SMS] Sending to ${phoneNumber}: ${messageBody}`);
    return { sid: 'SM_mock_sid', status: 'sent' };
  }

  const message = await client.messages.create({
    body: messageBody,
    from: fromNumber,
    to: phoneNumber
  });

  return message;
};
