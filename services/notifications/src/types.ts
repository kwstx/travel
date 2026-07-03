export interface FlightInfo {
  flightNumber: string;
  scheduledDepartureTime: string;
  updatedDepartureTime?: string;
  gate?: string;
  terminal?: string;
  status: 'DELAYED' | 'CANCELLED' | 'GATE_CHANGE' | 'ON_TIME';
}

export interface NotificationPayload {
  title: string;
  body: string;
  flightInfo: FlightInfo;
  deepLink: string;
  // Category for interactive actions (e.g., "FLIGHT_UPDATE", "IMESSAGE_CARD")
  actionCategory?: string; 
}

export type Channel = 'apns' | 'sms' | 'email';

export interface UserPreferences {
  userId: string;
  preferredChannels: Channel[]; // In order of preference, e.g., ['apns', 'sms']
  apnsDeviceToken?: string;
  phoneNumber?: string;
  emailAddress?: string;
}

export interface DispatchResult {
  success: boolean;
  channelUsed: Channel;
  providerResponse?: any;
  error?: any;
}
