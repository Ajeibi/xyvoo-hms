import { create } from "zustand";
import type {
  HotelRegisterAccountDraft,
  HotelRegisterBillingCycle,
  HotelRegisterHotelDraft,
} from "@/types";

type Hotel = HotelRegisterHotelDraft;
type Account = HotelRegisterAccountDraft;
type BillingCycle = HotelRegisterBillingCycle;
type State = {
  step: number; hotel: Hotel; account: Account; billingCycle: BillingCycle; loading: boolean; error: string; tenantId: string | null;
  showMissingFieldsModal: boolean; missingFields: string[]; otp: string[]; otpError: string; resendCooldown: number; canResend: boolean; otpExpiry: number | null; accountError: string;
  setHotelField: (field: keyof Hotel, value: string | boolean) => void; setAccountField: (field: keyof Account, value: string | boolean) => void;
  closeMissingFieldsModal: () => void; setOtpDigit: (index: number, value: string) => void; resetOtpDigits: () => void; resendOtp: () => Promise<void>;
  setBillingCycle: (v: BillingCycle) => void; setStep: (v: number) => void;
  sendOtp: () => Promise<void>; verifyOtp: (code?: string) => Promise<void>; saveAccountDetails: () => Promise<void>; startTrial: () => Promise<void>; initiatePayment: () => Promise<void>;
};

const initialHotel: Hotel = { hotel_name: "", contact_email: "", contact_phone: "", country: "Nigeria", city: "", address: "", room_count: "", hotel_type: "", agreed: false };
const initialOtp = ["", "", "", "", "", ""];

export const useHotelRegisterStore = create<State>((set, get) => ({
  step: 0, hotel: initialHotel, account: { contact_name: "", password: "", confirm: "", whatsapp: false }, billingCycle: "monthly", loading: false, error: "", tenantId: null,
  showMissingFieldsModal: false, missingFields: [], otp: [...initialOtp], otpError: "", resendCooldown: 60, canResend: false, otpExpiry: null, accountError: "",
  setHotelField: (field, value) => set((s) => ({ hotel: { ...s.hotel, [field]: value } as Hotel })),
  setAccountField: (field, value) => set((s) => ({ account: { ...s.account, [field]: value } as Account })),
  closeMissingFieldsModal: () => set({ showMissingFieldsModal: false }),
  setOtpDigit: (index, value) =>
    set((s) => {
      const next = [...s.otp];
      next[index] = value;
      return { otp: next };
    }),
  resetOtpDigits: () => set({ otp: [...initialOtp], otpError: "" }),
  setBillingCycle: (billingCycle) => set({ billingCycle }), setStep: (step) => set({ step }),
  resendOtp: async () => {
    if (!get().canResend) return;
    set({ loading: true, error: "" });
    const res = await fetch("/api/hotel/register/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(get().hotel) });
    const data = await res.json();
    set({ loading: false });
    if (!res.ok) return set({ error: data.error || "Failed to resend OTP" });
    set({ otp: [...initialOtp], canResend: false, resendCooldown: 60, otpExpiry: Date.now() + 10 * 60 * 1000 });
  },
  sendOtp: async () => {
    const h = get().hotel;
    const missing: string[] = [];
    if (!h.hotel_name.trim()) missing.push("Hotel Name");
    if (!h.contact_email.trim()) missing.push("Hotel Email");
    if (!h.contact_phone) missing.push("Phone Number");
    if (!h.country) missing.push("Country");
    if (!h.city) missing.push("City");
    if (!h.address.trim()) missing.push("Address");
    if (!h.room_count) missing.push("Number of Rooms");
    if (!h.hotel_type) missing.push("Hotel Type");
    if (!h.agreed) missing.push("Terms Agreement");
    if (missing.length > 0) return set({ showMissingFieldsModal: true, missingFields: missing, error: "" });

    set({ loading: true, error: "" });
    const res = await fetch("/api/hotel/register/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(get().hotel) });
    const data = await res.json();
    set({ loading: false });
    if (!res.ok) return set({ error: data.error || "Failed to send OTP" });
    set({ tenantId: data.tenant_id, step: 1, otp: [...initialOtp], otpExpiry: Date.now() + 10 * 60 * 1000, canResend: false, resendCooldown: 60 });
  },
  verifyOtp: async (code) => {
    const otpCode = code ?? get().otp.join("");
    if (otpCode.length !== 6) return set({ otpError: "Enter all 6 digits." });
    set({ loading: true, error: "" });
    const res = await fetch("/api/hotel/register/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: get().tenantId, code: otpCode }) });
    const data = await res.json();
    set({ loading: false });
    if (!res.ok) return set({ otpError: data.error || "Invalid OTP" });
    set({ step: 2 });
  },
  saveAccountDetails: async () => {
    const { account, hotel, tenantId } = get();
    if (!account.password) return set({ accountError: "Password is required." });
    if (account.password !== account.confirm) return set({ accountError: "Passwords do not match." });
    set({ loading: true, error: "" });
    const res = await fetch("/api/hotel/register/save-details", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: tenantId, ...hotel, ...account, contact_email: hotel.contact_email }) });
    const data = await res.json();
    set({ loading: false });
    if (!res.ok) return set({ accountError: data.error || "Failed to save account details" });
    set({ step: 3 });
  },
  startTrial: async () => {
    set({ loading: true, error: "" });
    const res = await fetch("/api/hotel/register/start-trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: get().tenantId, plan: get().billingCycle }) });
    const data = await res.json();
    set({ loading: false });
    if (!res.ok) return set({ error: data.error || "Failed to start trial" });
    set({ step: 5 });
  },
  initiatePayment: async () => {
    set({ loading: true, error: "" });
    const res = await fetch("/api/hotel/register/initiate-payment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: get().tenantId, plan: get().billingCycle, email: get().hotel.contact_email }) });
    const data = await res.json();
    set({ loading: false });
    if (!res.ok) return set({ error: data.error || "Failed to initiate payment" });
    if (data.authorization_url) window.location.href = data.authorization_url;
  },
}));
