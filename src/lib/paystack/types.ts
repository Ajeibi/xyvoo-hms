export type PaystackMode = "test" | "live";

export type PaystackPurpose = "folio_charge" | "preauth" | "registration";

export type PaystackIntentStatus = "pending" | "success" | "failed" | "abandoned";

export type PaystackTenantConfig = {
  enabled?: boolean;
  mode?: PaystackMode;
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
};

export type PaystackTenantConfigPublic = {
  enabled: boolean;
  mode: PaystackMode;
  publicKey: string | null;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
};

export type PaystackInitializeResult = {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
};

export type PaystackVerifyData = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  authorization?: {
    authorization_code?: string;
    last4?: string;
    card_type?: string;
    bank?: string;
    channel?: string;
  };
  customer?: { email?: string };
  gateway_response?: string;
};

export type PaymentIntentRow = {
  id: string;
  tenant_id: string;
  reservation_id: string | null;
  amount: number;
  currency_code: string;
  purpose: PaystackPurpose;
  paystack_reference: string;
  authorization_code: string | null;
  status: PaystackIntentStatus;
  folio_transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
