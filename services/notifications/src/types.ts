export interface FlightInfo {
  flightNumber: string;
  scheduledDepartureTime: string;
  updatedDepartureTime?: string;
  gate?: string;
  terminal?: string;
  status: 'DELAYED' | 'CANCELLED' | 'GATE_CHANGE' | 'ON_TIME';
}

export interface NotificationOption {
  id: string;
  description: string;
  actionUrl: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  flightInfo: FlightInfo;
  deepLink: string;
  // Category for interactive actions (e.g., "FLIGHT_UPDATE", "IMESSAGE_CARD", "DISRUPTION_INTERACTIVE_DECISION")
  actionCategory?: string; 
  // Options for interactive decision matrices
  options?: NotificationOption[];
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
