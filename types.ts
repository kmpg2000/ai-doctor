export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  images?: string[]; // Base64 strings
  groundingMetadata?: any; // For Google Maps data
  isThinking?: boolean;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  ERROR = 'ERROR'
}
