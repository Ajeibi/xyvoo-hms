"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getConsent } from "@/lib/store/analytics-client";
import { CreateAccountForm } from "./AccountForms";
import { announce, useStorefront } from "./StorefrontProvider";
import { useShopAccount } from "./useShopAccount";

/*
 * After a shopper has spent 5 minutes on the shop, a panel slides up inviting
 * them to create an account. It never blocks the page (Google ranks shops lower
 * for pop-ups that cover content on phones, and a blocking box is harder for
 * screen reader and keyboard users), it says plainly that skipping it changes
 * nothing, and once closed it stays away for 30 days.
 */

const SHOW_AFTER_MS = 5 * 60_000;
const SNOOZE_MS = 30 * 86_400_000;
const startKey = (slug: string) => `sf-visit-start:${slug}`;
const snoozeKey = (slug: string) => `sf-account-prompt:${slug}`;
/** Pages where the invitation would get in the way. */
const QUIET_PATHS = /\/(checkout|account|reminders|review)(\/|$)/;

const read = (storage: "local" | "session", key: string) => {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: "local" | "session", key: string, value: string) => {
  try {
    (storage === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // Private browsing: the invitation may show again, which is harmless.
  }
};

export default function AccountPrompt({
  storeName,
  privacyHref,
}: {
  storeName: string;
  privacyHref: string | null;
}) {
  const { slug, href } = useStorefront();
  const { status, account } = useShopAccount();
  const pathname = usePathname();
  const [due, setDue] = useState(false);
  const [closed, setClosed] = useState(false);
  const [done, setDone] = useState(false);
  // Starts as a small card; the form only opens when the shopper asks for it.
  const [open, setOpen] = useState(false);
  const firstField = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Time on the shop is counted from the first page this visit, across pages.
  useEffect(() => {
    const snoozed = Number(read("local", snoozeKey(slug)));
    if (snoozed && Date.now() - snoozed < SNOOZE_MS) return;
    if (window.self !== window.top) return; // the website editor's preview
    let start = Number(read("session", startKey(slug)));
    if (!start) {
      start = Date.now();
      write("session", startKey(slug), String(start));
    }
    let timer = 0;
    const check = () => {
      // Wait for the cookie banner to be answered, so the two never overlap.
      if (getConsent(slug) === null) {
        timer = window.setTimeout(check, 15_000);
        return;
      }
      setDue(true);
    };
    timer = window.setTimeout(
      check,
      Math.max(0, start + SHOW_AFTER_MS - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [slug]);

  const visible =
    due &&
    !closed &&
    status === "ready" &&
    (!account || done) &&
    !QUIET_PATHS.test(pathname);

  useEffect(() => {
    if (visible && !done)
      announce(
        `${storeName} invites you to create a free account. The invitation is at the bottom of the page.`,
      );
  }, [visible, done, storeName]);

  if (!visible) return null;

  const close = () => {
    write("local", snoozeKey(slug), String(Date.now()));
    setClosed(true);
  };

  return (
    <section className="account-prompt" aria-labelledby="account-prompt-title">
      <button
        type="button"
        className="account-prompt__close"
        onClick={close}
        aria-label="Close the account invitation"
      >
        <span aria-hidden="true">×</span>
      </button>
      {done ? (
        <div role="status">
          <h2
            className="account-prompt__title"
            id="account-prompt-title"
            ref={heading}
            tabIndex={-1}
          >
            You&rsquo;re all set
          </h2>
          <p className="body-copy">
            Your account is ready. When you order, your details will already be
            filled in.
          </p>
          <div className="account-form__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={close}
            >
              Keep shopping
            </button>
            <Link
              className="link-button"
              href={href("/account")}
              onClick={close}
            >
              See your account
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h2 className="account-prompt__title" id="account-prompt-title">
            Create your free account with {storeName}
          </h2>
          <p className="body-copy">
            Check out faster, keep your basket on any device and see your orders
            in one place.
          </p>
          <p className="account-prompt__optional">
            It&rsquo;s completely optional. Skipping it changes nothing: you can
            keep browsing and order as normal. When you order, we&rsquo;ll set
            up your account from your checkout details.
          </p>
          {!open ? (
            <div className="account-form__actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  setOpen(true);
                  window.setTimeout(
                    () => firstField.current?.querySelector("input")?.focus(),
                    0,
                  );
                }}
              >
                Create my account
              </button>
              <button type="button" className="link-button" onClick={close}>
                Not now
              </button>
            </div>
          ) : (
            <div ref={firstField}>
              <CreateAccountForm
                source="prompt"
                storeName={storeName}
                privacyHref={privacyHref}
                onDone={() => {
                  write("local", snoozeKey(slug), String(Date.now()));
                  setDone(true);
                  window.setTimeout(() => heading.current?.focus(), 0);
                }}
                extraActions={
                  <button type="button" className="link-button" onClick={close}>
                    Not now
                  </button>
                }
              />
            </div>
          )}
          <p className="account-prompt__signin">
            Already have an account?{" "}
            <Link href={href("/account")} onClick={close}>
              Sign in
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
