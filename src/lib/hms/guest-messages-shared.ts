/* Browser-safe parts of guest messages: channels, ready-made wording and filling in a guest's details. */

export const MESSAGE_CHANNELS = ["email", "whatsapp"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = { email: "Email", whatsapp: "WhatsApp" };

export const MAX_BROADCAST_GUESTS = 200;

export type MessageStatus = "sent" | "prepared" | "failed";

export type GuestMessageRow = {
  id: string;
  reservationId: string;
  channel: MessageChannel;
  recipient: string | null;
  subject: string | null;
  body: string;
  status: MessageStatus;
  error: string | null;
  broadcastId: string | null;
  createdAt: string;
};

export type MessageRecipient = {
  reservationId: string;
  guestId: string | null;
  name: string;
  roomCode: string | null;
  email: string | null;
  /** The number a WhatsApp chat would open to: the guest's WhatsApp, else their phone. */
  whatsapp: string | null;
};

export type MessageTemplate = { key: string; label: string; subject: string; body: string };

/** Wording the desk can start from. `{name}` is the guest's first name, `{room}` their room, `{hotel}` the hotel. */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: "welcome",
    label: "Welcome",
    subject: "Welcome to {hotel}",
    body: "Hello {name}, welcome to {hotel}. We hope you are settling in to room {room}. Call the front desk any time if you need anything.",
  },
  {
    key: "checkout",
    label: "Check-out reminder",
    subject: "Your check-out at {hotel}",
    body: "Hello {name}, a reminder that check-out is at noon. If you would like a late check-out, reply or call the front desk and we will do our best.",
  },
  {
    key: "notice",
    label: "Notice to guests",
    subject: "A notice from {hotel}",
    body: "Hello {name}, we would like to let you know about a short interruption today. We are sorry for any trouble and thank you for your patience.",
  },
];

/** The first name from a full name, ignoring a title. */
export function firstNameOf(fullName: string) {
  const cleaned = fullName.replace(/^(mr|mrs|ms|miss|dr|prof|chief|engr|barr)\.?\s+/i, "").trim();
  return cleaned.split(/\s+/)[0] || "there";
}

/** Fills `{name}`, `{room}` and `{hotel}` in the message for one guest. A room that isn't known reads as "your room". */
export function personalise(template: string, vars: { name: string; room: string | null; hotel: string }) {
  return template
    .replace(/\{name\}/gi, firstNameOf(vars.name))
    .replace(/\{room\}/gi, vars.room ?? "your room")
    .replace(/\{hotel\}/gi, vars.hotel);
}
