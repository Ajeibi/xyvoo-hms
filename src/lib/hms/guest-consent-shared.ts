/** Marketing consent under the Nigeria Data Protection Act (NDPA): the pieces the browser and the server share. */

export const CONSENT_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_CHANNEL_LABEL: Record<ConsentChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

export const CONSENT_SOURCES = ["desk", "guest_link", "unsubscribe", "online_checkin", "import", "erasure"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const CONSENT_SOURCE_LABEL: Record<ConsentSource, string> = {
  desk: "Told staff at the desk",
  guest_link: "Through a link they opened",
  unsubscribe: "Unsubscribed",
  online_checkin: "Online check-in",
  import: "Imported",
  erasure: "Details erased",
};

export type ConsentState = Record<ConsentChannel, boolean>;

export type ConsentLogEntry = {
  id: string;
  channel: ConsentChannel;
  granted: boolean;
  source: ConsentSource;
  note: string | null;
  recordedByName: string | null;
  createdAt: string;
};

export const NO_CONSENT: ConsentState = { email: false, sms: false, whatsapp: false };

/** True when the guest has agreed to hear from the hotel on at least one channel. */
export function hasAnyConsent(state: ConsentState) {
  return state.email || state.sms || state.whatsapp;
}
