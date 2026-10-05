"use client";

import { Fragment, useEffect, useState } from "react";

const UNITS = [
  { key: "d", label: "Days", ms: 86_400_000 },
  { key: "h", label: "Hours", ms: 3_600_000 },
  { key: "m", label: "Minutes", ms: 60_000 },
  { key: "s", label: "Seconds", ms: 1000 },
] as const;

function split(remaining: number) {
  let rest = Math.max(0, remaining);
  return UNITS.map((u) => {
    const value = Math.floor(rest / u.ms);
    rest -= value * u.ms;
    return String(value).padStart(2, "0");
  });
}

/**
 * Sale countdown from the Loftwood template. The ticking digits are hidden
 * from screen readers, which get the end date as text instead; the digits
 * show "00" until mounted so server and client HTML match.
 */
export default function Countdown({ endsAt, endsText }: { endsAt: string; endsText: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const end = new Date(endsAt).getTime();
    const tick = () => setRemaining(end - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const ended = remaining !== null && remaining <= 0;
  const digits = remaining === null ? UNITS.map(() => "00") : split(remaining);

  return (
    <div className={`countdown${ended ? " is-ended" : ""}`} data-countdown={endsAt}>
      <p className="visually-hidden">Offer ends {endsText}</p>
      {!ended ? (
        <ul className="countdown__units" aria-hidden="true">
          {UNITS.map((u, i) => (
            <Fragment key={u.key}>
              {i > 0 ? <li className="countdown__sep">:</li> : null}
              <li>
                <b>{digits[i]}</b>
                {u.label}
              </li>
            </Fragment>
          ))}
        </ul>
      ) : (
        <p className="deal-timer__ended">This offer has ended</p>
      )}
    </div>
  );
}
