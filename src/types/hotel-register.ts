export type HotelRegisterBillingCycle = "monthly" | "quarterly" | "yearly";

export type HotelRegisterHotelDraft = {
  hotel_name: string;
  /** Web address label, e.g. `grand-palace` for grand-palace.getxyvoo.com. */
  subdomain: string;
  contact_email: string;
  contact_phone: string;
  country: string;
  city: string;
  address: string;
  room_count: string;
  hotel_type: string;
  agreed: boolean;
};

export type HotelRegisterAccountDraft = {
  contact_name: string;
  password: string;
  confirm: string;
  whatsapp: boolean;
};
