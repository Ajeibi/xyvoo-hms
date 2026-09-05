"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  Bell,
  BedDouble,
  CheckCheck,
  ChefHat,
  ChevronDown,
  Clock,
  ClipboardList,
  CreditCard,
  DoorOpen,
  FileText,
  Footprints,
  Landmark,
  Package,
  PackageCheck,
  Receipt,
  Route,
  Shirt,
  Sparkles,
  UserCheck,
  UtensilsCrossed,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { LOGO_URL } from "@/constants/branding";

/**
 * A guest's stay as a trunk growing out of the platform, with the granular,
 * cross-department work at each stage branching off the sides — grounded in
 * the real reservation-centred data model: folio_transactions,
 * housekeeping_tasks, fb_orders and room_incidents all key off the same
 * reservation_id, which is exactly what "one system, many hands" means here.
 */
type Branch = { id: string; icon: LucideIcon; label: string; detail: string };
type Stage = { id: string; label: string; side: "left" | "right"; branches: Branch[] };

const STAGES: Stage[] = [
  {
    id: "check-in",
    label: "Check-in",
    side: "right",
    branches: [
      {
        id: "details",
        icon: UserCheck,
        label: "Front desk captures the guest's details",
        detail:
          "Guest profile and ID are captured once, at the desk — the same record every other department reads from for the rest of the stay.",
      },
      {
        id: "room",
        icon: BedDouble,
        label: "Room assigned",
        detail:
          "The room is locked against the booking the moment it's assigned, so housekeeping and front desk always see the same status.",
      },
      {
        id: "escort",
        icon: Footprints,
        label: "Staff walks them to their room",
        detail:
          "A human touch, not a system step — nothing needs re-entering once the guest is in the room.",
      },
    ],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    side: "left",
    branches: [
      {
        id: "prepped",
        icon: ClipboardList,
        label: "Room already prepped by housekeeping",
        detail:
          "Housekeeping's task list is generated straight from the booking, so the room is ready before the guest reaches the door.",
      },
      {
        id: "extras",
        icon: Bell,
        label: "Guest requests extras — towels, amenities",
        detail:
          "Logged against the room and picked up on housekeeping's live board — no phone calls between departments.",
      },
    ],
  },
  {
    id: "fb",
    label: "F&B",
    side: "right",
    branches: [
      {
        id: "order",
        icon: UtensilsCrossed,
        label: "Orders from the restaurant menu",
        detail:
          "Whether it's the restaurant or room service, the order is tied to the guest's room from the first tap.",
      },
      {
        id: "kitchen",
        icon: ChefHat,
        label: "Sent straight to the kitchen screen",
        detail:
          "No handwritten dockets — the order appears on the kitchen display the moment it's placed.",
      },
      {
        id: "wait",
        icon: Clock,
        label: "Wait time communicated back to the guest",
        detail:
          "The kitchen sets the pace; front-of-house passes it straight to the guest, no guesswork.",
      },
      {
        id: "ready",
        icon: CheckCheck,
        label: "Food's ready, sent out",
        detail:
          "Kitchen marks it done and it's on its way — the same order record follows it out.",
      },
      {
        id: "pay",
        icon: CreditCard,
        label: "Paid by POS, or billed to the room",
        detail:
          "Either it's settled at the till, or it lands on the guest's folio automatically — your finance team sees it either way, no chasing paper.",
      },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    side: "left",
    branches: [
      {
        id: "flag",
        icon: Wrench,
        label: "Guest or staff flags an issue",
        detail:
          "Anyone can raise it — a guest complaint or a housekeeping note — and it's logged against the exact room.",
      },
      {
        id: "route",
        icon: Route,
        label: "Routed to the right person",
        detail: "No shouting down a corridor — the right maintenance person gets it directly.",
      },
      {
        id: "resolve",
        icon: CheckCheck,
        label: "Resolved and logged against the room",
        detail:
          "Once it's fixed, it's on record — so the next guest, and your own reporting, both see a clean history.",
      },
    ],
  },
  {
    id: "laundry",
    label: "Laundry",
    side: "right",
    branches: [
      {
        id: "request",
        icon: Shirt,
        label: "Guest requests laundry or pressing",
        detail: "Requested from the room, logged the same way as any other guest service.",
      },
      {
        id: "process",
        icon: Sparkles,
        label: "Collected, processed, billed to the room",
        detail:
          "Picked up, processed, and the charge lands on the same folio as everything else — one bill, not three.",
      },
      {
        id: "return",
        icon: PackageCheck,
        label: "Returned to the room",
        detail: "Closes the loop — the guest gets it back and the job's marked complete.",
      },
    ],
  },
  {
    id: "check-out",
    label: "Check-out",
    side: "left",
    branches: [
      {
        id: "folio",
        icon: FileText,
        label: "Every charge already on the folio",
        detail:
          "Room, F&B, laundry — it's all been landing in one place since check-in, so there's nothing to chase at the desk.",
      },
      {
        id: "settle",
        icon: Receipt,
        label: "Payment settled in moments",
        detail:
          "One folio, one payment — no reconciling separate systems for rooms, food and extras.",
      },
      {
        id: "release",
        icon: DoorOpen,
        label: "Room released back to housekeeping",
        detail:
          "The moment they leave, the room reappears on housekeeping's board as ready for turnover.",
      },
    ],
  },
];

/** Back-of-house work that supports every stay but isn't a stage any one
 * guest passes through — real (accounts/night-audit, procurement, inventory
 * are all live, tenant-wide tables), just not part of the guest-facing
 * trunk, so it's called out separately rather than forced onto the tree. */
const ROOTS = [
  { id: "accounting", icon: Landmark, label: "Accounting & night audit" },
  { id: "procurement", icon: Package, label: "Procurement" },
  { id: "inventory", icon: Warehouse, label: "Inventory & stock" },
];

const DIM_LINE = {
  background: "rgba(7, 22, 44, 0.14)",
};

const GLOW_LINE = {
  background: "var(--xyvoo-blue)",
  boxShadow:
    "0 0 8px 1px rgba(0, 126, 223, 0.65), 0 0 22px 4px rgba(0, 126, 223, 0.35)",
};

function FadeIn({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** How lit a given stage is, derived from one shared scroll-progress value —
 * so the glow reads as a single line travelling down and switching each
 * stage on as it arrives, rather than everything fading in independently.
 * lineHeight fills this stage's own row-height line segment over the same
 * range, so the glow always terminates exactly at the row it's lighting up
 * instead of overshooting into whatever comes after it. */
function useStageReveal(progress: MotionValue<number>, index: number, total: number) {
  const end = (index + 0.7) / total;
  const start = end - 0.9 / total;
  const dotOpacity = useTransform(progress, [start, end], [0.2, 1]);
  const cardOpacity = useTransform(progress, [start, end], [0.12, 1]);
  const cardShift = useTransform(progress, [start, end], [14, 0]);
  const lineHeight = useTransform(progress, [start, end], ["0%", "100%"]);
  return { dotOpacity, cardOpacity, cardShift, lineHeight };
}

function StageDot({ litOpacity }: { litOpacity: MotionValue<number> }) {
  return (
    <div
      className="relative z-[2] h-4 w-4 shrink-0 rounded-full"
      style={{ background: "rgba(0, 126, 223, 0.22)", boxShadow: "0 0 0 6px #f8fafc" }}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          opacity: litOpacity,
          background: "var(--xyvoo-blue)",
          boxShadow:
            "0 0 12px 3px rgba(0, 126, 223, 0.75), 0 0 26px 6px rgba(0, 126, 223, 0.35)",
        }}
      />
    </div>
  );
}

/** One branch row. Desktop shows the detail on hover (a side popover) since
 * a mouse is available; mobile has no hover, so the same detail instead
 * expands inline below the row on tap. Tapping also works on desktop, as a
 * pin-it-open alternative to hovering. */
function BranchItem({ branch, side }: { branch: Branch; side: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const Icon = branch.icon;
  const revealClass = open
    ? "opacity-100"
    : "opacity-0 group-hover/branch:opacity-100";

  return (
    <div className="group/branch relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 bg-transparent p-0 text-[12.5px] leading-[1.4] text-xyvoo-navy/85 ${
          side === "left" ? "flex-row-reverse text-right" : "text-left"
        }`}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgb(var(--xyvoo-blue-rgb) / 0.14)" }}
        >
          <Icon className="h-3.5 w-3.5 text-xyvoo-blue" aria-hidden />
        </span>
        <span className="flex-1">{branch.label}</span>
        {/* Tap-to-expand affordance — only needed where there's no hover */}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-xyvoo-blue/60 transition-transform duration-200 md:hidden ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {/* Mobile: detail expands inline, in normal flow, below the row */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 md:hidden ${
          open ? "mt-2 max-h-40 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div
          className="rounded-xl border px-3.5 py-3 text-[12px] leading-[1.55] text-xyvoo-navy/80"
          style={{
            borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.14)",
            background: "rgb(var(--xyvoo-blue-rgb) / 0.04)",
          }}
        >
          {branch.detail}
        </div>
      </div>

      {/* Desktop: connector + side popover, stopping short of the box
          (a real gap) rather than running straight into it. */}
      <div
        className={`pointer-events-none absolute top-1/2 z-30 hidden h-px w-2 -translate-y-1/2 transition-opacity duration-150 md:block ${revealClass}`}
        style={{
          ...(side === "right" ? { left: "100%" } : { right: "100%" }),
          background: "var(--xyvoo-blue)",
        }}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute top-1/2 z-30 hidden w-64 -translate-y-1/2 rounded-2xl border px-3.5 py-3 text-[12px] leading-[1.55] text-xyvoo-navy/80 shadow-[0_12px_28px_rgba(0,13,31,0.18)] transition-opacity duration-150 md:block ${revealClass}`}
        style={{
          ...(side === "right"
            ? { left: "calc(100% + 22px)" }
            : { right: "calc(100% + 22px)" }),
          borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.14)",
          background: "rgb(var(--xyvoo-blue-rgb) / 0.04)",
        }}
      >
        {branch.detail}
      </div>
    </div>
  );
}

function BranchList({ branches, side }: { branches: Branch[]; side: "left" | "right" }) {
  return (
    <div
      className="w-full max-w-[280px] rounded-2xl border px-4 py-4"
      style={{
        borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.14)",
        background: "rgb(var(--xyvoo-blue-rgb) / 0.04)",
      }}
    >
      <div className="flex flex-col gap-2.5">
        {branches.map((branch) => (
          <BranchItem key={branch.id} branch={branch} side={side} />
        ))}
      </div>
    </div>
  );
}

function DesktopStageRow({
  stage,
  index,
  progress,
}: {
  stage: Stage;
  index: number;
  progress: MotionValue<number>;
}) {
  const { dotOpacity, cardOpacity, cardShift, lineHeight } = useStageReveal(
    progress,
    index,
    STAGES.length,
  );
  const cardStyle = { opacity: cardOpacity, y: cardShift };

  return (
    <div className="grid grid-cols-[1fr_2px_1fr] gap-x-0 py-8 first:pt-4">
      <div className={stage.side === "left" ? "flex items-center justify-end pr-8" : ""}>
        {stage.side === "left" && (
          <div className="flex items-center gap-0">
            <motion.div style={cardStyle}>
              <BranchList branches={stage.branches} side="left" />
            </motion.div>
            <div className="h-px w-8" style={GLOW_LINE} aria-hidden />
          </div>
        )}
      </div>

      <div className="relative">
        <div
          className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2"
          style={DIM_LINE}
          aria-hidden
        />
        <motion.div
          className="absolute left-1/2 top-0 w-[2px] -translate-x-1/2"
          style={{ height: lineHeight, ...GLOW_LINE }}
          aria-hidden
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <StageDot litOpacity={dotOpacity} />
          {/* Label sits opposite the branch card — the card is the detail
              for this stage, so the name introduces it from the other side
              rather than crowding right up against it. */}
          <span
            className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[13px] font-extrabold text-xyvoo-navy ${
              stage.side === "left" ? "left-full ml-4" : "right-full mr-4"
            }`}
          >
            {stage.label}
          </span>
        </div>
      </div>

      <div className={stage.side === "right" ? "flex items-center justify-start pl-8" : ""}>
        {stage.side === "right" && (
          <div className="flex items-center gap-0">
            <div className="h-px w-8" style={GLOW_LINE} aria-hidden />
            <motion.div style={cardStyle}>
              <BranchList branches={stage.branches} side="right" />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileStageRow({
  stage,
  index,
  progress,
}: {
  stage: Stage;
  index: number;
  progress: MotionValue<number>;
}) {
  const { dotOpacity, cardOpacity, cardShift, lineHeight } = useStageReveal(
    progress,
    index,
    STAGES.length,
  );

  return (
    <div className="flex gap-4 pb-8 last:pb-0">
      <div className="relative w-4 shrink-0">
        <div
          className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2"
          style={DIM_LINE}
          aria-hidden
        />
        <motion.div
          className="absolute left-1/2 top-0 w-[2px] -translate-x-1/2"
          style={{ height: lineHeight, ...GLOW_LINE }}
          aria-hidden
        />
        <div className="relative pt-1">
          <StageDot litOpacity={dotOpacity} />
        </div>
      </div>
      <motion.div className="flex-1" style={{ opacity: cardOpacity, y: cardShift }}>
        <h3 className="mb-3 text-[15px] font-extrabold text-xyvoo-navy">{stage.label}</h3>
        <BranchList branches={stage.branches} side="right" />
      </motion.div>
    </div>
  );
}

function RootsCallout() {
  return (
    <FadeIn delay={0.1}>
      <div
        className="mx-auto mb-16 flex max-w-[520px] flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-5 text-center"
        style={{
          borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.25)",
          background: "rgb(var(--xyvoo-blue-rgb) / 0.03)",
        }}
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-xyvoo-blue">
          Running in the background, every day
        </span>
        <p className="text-[13px] leading-[1.6] text-xyvoo-navy/60">
          Your books, your stock and your suppliers — kept in order
          continuously, not just when a guest happens to be staying.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {ROOTS.map((chip) => {
            const Icon = chip.icon;
            return (
              <div
                key={chip.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-[12.5px] font-semibold text-xyvoo-navy/80"
                style={{ borderColor: "rgb(var(--xyvoo-blue-rgb) / 0.18)" }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-xyvoo-blue" aria-hidden />
                {chip.label}
              </div>
            );
          })}
        </div>
      </div>
    </FadeIn>
  );
}

export function SolutionsHotelWorkflow() {
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: desktopProgress } = useScroll({
    target: desktopRef,
    offset: ["start 0.85", "end 0.4"],
  });
  const { scrollYProgress: mobileProgress } = useScroll({
    target: mobileRef,
    offset: ["start 0.85", "end 0.4"],
  });

  return (
    <section
      className="relative overflow-hidden border-t border-slate-100 px-6 py-16 md:py-24"
      style={{ background: "#f8fafc" }}
      aria-labelledby="hotel-workflow-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(7,22,44,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(7,22,44,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-[900px]">
        <FadeIn>
          <div className="mx-auto mb-16 max-w-2xl text-center md:mb-20">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-xyvoo-blue">
              How it really works
            </p>
            <h2
              id="hotel-workflow-heading"
              className="mb-5 text-balance text-[clamp(1.75rem,4vw,2.75rem)] font-extrabold leading-[1.15] text-xyvoo-navy"
            >
              One stay. Every department, at once.
            </h2>
            <p className="mx-auto text-[16px] leading-[1.75] text-xyvoo-navy/65">
              To the guest, it's one simple visit. Underneath, every
              department is working off the exact same booking — here's what
              actually happens at each stage.
            </p>
          </div>
        </FadeIn>

        {/* Root: the platform everything grows out of */}
        <FadeIn delay={0.04}>
          <div className="mx-auto mb-8 flex flex-col items-center">
            <Image
              src={LOGO_URL}
              alt="XYVOO"
              width={200}
              height={60}
              style={{
                width: "auto",
                height: "48px",
                filter: "drop-shadow(0 6px 16px rgba(0, 13, 31, 0.15))",
              }}
            />
            <span className="mt-4 text-[12.5px] text-xyvoo-navy/50">
              One platform, everything below runs on it
            </span>
          </div>
        </FadeIn>

        <RootsCallout />

        {/* Desktop: central trunk with branches alternating left/right,
            lit progressively by scroll position so the glow reads as one
            line travelling down and switching each stage on as it arrives */}
        <div ref={desktopRef} className="hidden md:block">
          <div className="flex flex-col">
            {STAGES.map((stage, index) => (
              <DesktopStageRow
                key={stage.id}
                stage={stage}
                index={index}
                progress={desktopProgress}
              />
            ))}
          </div>
        </div>

        {/* Mobile: single vertical trunk, branches stacked beneath each stage */}
        <div ref={mobileRef} className="flex flex-col md:hidden">
          {STAGES.map((stage, index) => (
            <MobileStageRow
              key={stage.id}
              stage={stage}
              index={index}
              progress={mobileProgress}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
