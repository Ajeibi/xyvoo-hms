"use client";

import { useEffect } from "react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import "react-phone-number-input/style.css";
import { useHotelRegisterStore } from "@/features/hotel-register/store";
import StepIndicator from "@/features/hotel-register/components/steps/StepIndicator";
import StepHotelDetails from "@/features/hotel-register/components/steps/StepHotelDetails";
import StepVerifyEmail from "@/features/hotel-register/components/steps/StepVerifyEmail";
import StepAccountSetup from "@/features/hotel-register/components/steps/StepAccountSetup";
import StepChoosePlan from "@/features/hotel-register/components/steps/StepChoosePlan";
import StepVerifyingPayment from "@/features/hotel-register/components/steps/StepVerifyingPayment";
import StepDone from "@/features/hotel-register/components/steps/StepDone";
import MissingFieldsModal from "@/features/hotel-register/components/MissingFieldsModal";

export default function RegisterPage() {
  const step = useHotelRegisterStore((s) => s.step);
  const otp = useHotelRegisterStore((s) => s.otp);
  const verifyOtp = useHotelRegisterStore((s) => s.verifyOtp);

  useEffect(() => {
    if (step !== 1) return;
    const iv = setInterval(() => {
      useHotelRegisterStore.setState((s) => {
        const next = s.resendCooldown <= 1 ? 0 : s.resendCooldown - 1;
        return { resendCooldown: next, canResend: next === 0 };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [step]);

  useEffect(() => {
    if (step === 1 && otp.every((d) => d !== "")) {
      verifyOtp();
    }
  }, [step, otp, verifyOtp]);

  const STEP_LABELS = ["Hotel Details", "Verify Email", "Account Setup", "Choose Plan"];

  return (
    <WebsiteLayout>
      <div className="flex-1 flex items-start justify-center px-4 py-10 pt-28 bg-slate-50 min-h-screen">
        <div className="w-full max-w-xl">
          {step < 5 && <StepIndicator step={step} labels={STEP_LABELS} />}
          {step === 0 && <StepHotelDetails />}
          {step === 1 && <StepVerifyEmail />}
          {step === 2 && <StepAccountSetup />}
          {step === 3 && <StepChoosePlan />}
          {step === 4 && <StepVerifyingPayment />}
          {step === 5 && <StepDone />}
        </div>
      </div>
      <MissingFieldsModal />
    </WebsiteLayout>
  );
}
