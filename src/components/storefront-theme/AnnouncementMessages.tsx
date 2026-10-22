"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./primitives";

/** How long each message shows before the next. */
const EVERY_MS = 6000;

export type AnnouncementMessage = { text: string; href: string | null };

/**
 * The announcement bar's messages. With more than one they take turns, with a
 * pause button (moving content must be stoppable), and they never move for
 * shoppers who ask for less motion, or while the pointer or keyboard is on
 * them. Changes aren't read out, so a screen reader isn't interrupted.
 */
export default function AnnouncementMessages({ messages, onDismiss }: { messages: AnnouncementMessage[]; onDismiss?: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const many = messages.length > 1;

  useEffect(() => {
    if (!many || paused || holding || still) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), EVERY_MS);
    return () => window.clearInterval(timer);
  }, [many, paused, holding, still, messages.length]);

  const message = messages[index % messages.length];
  return (
    <div
      className="announce"
      onMouseEnter={() => setHolding(true)}
      onMouseLeave={() => setHolding(false)}
      onFocus={() => setHolding(true)}
      onBlur={() => setHolding(false)}
    >
      {many && !still ? (
        <button type="button" className="announce__control" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          <Icon name={paused ? "play" : "pause"} size="sm" />
          <span className="visually-hidden">{paused ? "Play announcements" : "Pause announcements"}</span>
        </button>
      ) : null}
      <p aria-live="off">
        {message.href ? <Link href={message.href}>{message.text}</Link> : message.text}
        {many ? (
          <span className="visually-hidden">
            {" "}
            (announcement {(index % messages.length) + 1} of {messages.length})
          </span>
        ) : null}
      </p>
      {many && (still || paused) ? (
        <button type="button" className="announce__control" onClick={() => setIndex((i) => (i + 1) % messages.length)}>
          <Icon name="chevron-right" size="sm" />
          <span className="visually-hidden">Next announcement</span>
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="announce__control announce__close" onClick={onDismiss}>
          <Icon name="close" size="sm" />
          <span className="visually-hidden">Close announcements</span>
        </button>
      ) : null}
    </div>
  );
}
