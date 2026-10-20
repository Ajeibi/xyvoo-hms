"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import "react-phone-number-input/style.css";
import { useHotelRegisterStore } from "@/features/hotel-register/store";
import HotelAuthLayout from "@/features/hotel-register/components/HotelAuthLayout";
import { LINK_CLASS } from "@/features/hotel-register/components/fields";
import StepIndicator from "@/features/hotel-register/components/steps/StepIndicator";
import StepHotelDetails from "@/features/hotel-register/components/steps/StepHotelDetails";
import StepVerifyEmail from "@/features/hotel-register/components/steps/StepVerifyEmail";
import StepAccountSetup from "@/features/hotel-register/components/steps/StepAccountSetup";
import StepChoosePlan from "@/features/hotel-register/components/steps/StepChoosePlan";
import StepVerifyingPayment from "@/features/hotel-register/components/steps/StepVerifyingPayment";
import StepDone from "@/features/hotel-register/components/steps/StepDone";
import RegisterHighlights from "@/features/hotel-register/components/RegisterHighlights";
import MissingFieldsModal from "@/features/hotel-register/components/MissingFieldsModal";

const STEP_LABELS = ["Hotel details", "Verify email", "Account setup", "Choose plan"];

const STEP_TITLES = ["Register your hotel", "Verify your email", "Set up your account", "Choose your billing cycle"];

export default function RegisterPage() {
  const step = useHotelRegisterStore((s) => s.step);
  const otp = useHotelRegisterStore((s) => s.otp);
  const verifyOtp = useHotelRegisterStore((s) => s.verifyOtp);
  const hotelEmail = useHotelRegisterStore((s) => s.hotel.contact_email);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(step);

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

  // Each new step moves focus to its heading, so screen readers announce where the user is.
  useEffect(() => {
    if (step === firstStep.current) return;
    firstStep.current = -1;
    heading.current?.focus();
  }, [step]);

  const intros: React.ReactNode[] = [
    "Start your free 14-day trial. No credit card required.",
    <>
      We sent a 6-digit code to <strong className="font-semibold">{hotelEmail}</strong>. Enter it below to confirm your address.
    </>,
    "Almost done. Just a few more details.",
    "All cycles include every feature. 14-day free trial, no card required.",
  ];

  const showProgress = step <= 3;

  return (
    <HotelAuthLayout imageAlt="A receptionist welcoming guests at a hotel front desk" aside={<RegisterHighlights step={step} />}>
      {showProgress ? (
        <motion.div
          key={step}
          className="space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-wider text-xyvoo-blue-deep">XYVOO Hotel</p>
            <StepIndicator step={step} labels={STEP_LABELS} />
          </div>
          <p className="pt-2 text-sm font-medium text-xyvoo-blue-deep">
            Step {step + 1} of {STEP_LABELS.length}
          </p>
          <h1 ref={heading} tabIndex={-1} className="text-4xl font-bold leading-tight text-black focus:outline-none">
            {STEP_TITLES[step]}
          </h1>
          <p className="text-base leading-relaxed text-black">{intros[step]}</p>
        </motion.div>
      ) : null}

      {step === 0 && <StepHotelDetails />}
      {step === 1 && <StepVerifyEmail />}
      {step === 2 && <StepAccountSetup />}
      {step === 3 && <StepChoosePlan />}
      {step === 4 && <StepVerifyingPayment headingRef={heading} />}
      {step === 5 && <StepDone headingRef={heading} />}

      {step === 0 ? (
        <p className="text-center text-sm font-medium text-black">
          Already have an account?{" "}
          <Link className={LINK_CLASS} href="/auth/login">
            Sign in
          </Link>
        </p>
      ) : null}

      <MissingFieldsModal />
    </HotelAuthLayout>
  );
}
