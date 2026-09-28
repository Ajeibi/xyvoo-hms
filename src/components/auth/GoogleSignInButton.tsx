"use client";

import { useEffect, useRef } from "react";
import { loadGoogleIdentityScript, initializeGoogleIdentity, type GoogleCredentialResponse } from "@/lib/auth/google-identity";
import { getGoogleClientId } from "@/lib/env";
import { toastError } from "@/lib/app-toast";

interface GoogleSignInButtonProps {
  onCredential: (response: GoogleCredentialResponse) => void;
  className?: string;
}

export function GoogleSignInButton({ onCredential, className }: GoogleSignInButtonProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !window.google || !containerRef.current) return;
        initializeGoogleIdentity(getGoogleClientId(), onCredential);
        // Measure the wrapper (which fills the layout via `className`), not the initially-empty
        // button container itself — an empty div with no intrinsic width would measure 0.
        const wrapperWidth = wrapperRef.current?.offsetWidth || 0;
        const width = Math.min(Math.max(wrapperWidth || 320, 200), 400);
        window.google.accounts.id.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          width,
        });
      })
      .catch((scriptError: Error) => {
        toastError("Google sign-in unavailable", scriptError.message);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} className={className}>
      <div ref={containerRef} />
    </div>
  );
}
