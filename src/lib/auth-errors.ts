type AuthErrorLike = {
  message?: string;
  status?: number;
  code?: string;
};

export function formatSignInError(error: AuthErrorLike) {
  const raw = error.message?.trim() || "";
  const code = error.code?.toLowerCase() || "";
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    code === "invalid_credentials"
  ) {
    return {
      title: "Sign-in failed",
      message:
        "The email or password doesn't match our records. Check both fields and try again, or register if you haven't set up your hotel yet.",
    };
  }

  if (normalized.includes("email not confirmed") || code === "email_not_confirmed") {
    return {
      title: "Email not confirmed",
      message:
        "Confirm your email address before signing in. Check your inbox for the verification link from XYVOO.",
    };
  }

  if (
    normalized.includes("too many requests") ||
    code === "over_request_rate_limit"
  ) {
    return {
      title: "Too many attempts",
      message: "Please wait a minute before trying to sign in again.",
    };
  }

  if (normalized.includes("network") || normalized.includes("fetch")) {
    return {
      title: "Connection problem",
      message: "We couldn't reach the sign-in service. Check your internet connection and try again.",
    };
  }

  if (error.status && error.status >= 500) {
    return {
      title: "Sign-in unavailable",
      message: "Something went wrong on our side. Please try again in a few moments.",
    };
  }

  return {
    title: "Unable to sign in",
    message: raw || "Something went wrong. Please try again.",
  };
}
