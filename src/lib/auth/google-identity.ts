"use client";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleRenderButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
      prompt: () => void;
      renderButton: (parent: HTMLElement, options: GoogleRenderButtonOptions) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Google Identity Services script."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

let didInitialize = false;

/**
 * Google's `initialize()` is a page-global singleton call — calling it more than once
 * (e.g. once per duplicated desktop/mobile form instance) logs a warning and can corrupt
 * button rendering. Only the first call takes effect; later calls are no-ops.
 */
export function initializeGoogleIdentity(
  clientId: string,
  callback: (response: GoogleCredentialResponse) => void,
) {
  if (typeof window === "undefined" || !window.google) return;
  if (didInitialize) return;
  didInitialize = true;
  window.google.accounts.id.initialize({ client_id: clientId, callback });
}

export type { GoogleCredentialResponse };
