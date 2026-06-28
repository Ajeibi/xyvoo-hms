"use client";

import { useCallback, useEffect, useState } from "react";
import { driver, type Alignment, type DriveStep, type Side } from "driver.js";
import type { HotelDashboardTourStatus } from "@/types";

type HMSTourProps = {
  slug: string;
  initialStatus: HotelDashboardTourStatus;
};

type TourStepDefinition = {
  selector: string;
  title: string;
  description: string;
  side?: Side;
  align?: Alignment;
};

const PREV_ICON = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m15 18-6-6 6-6"></path>
  </svg>
`;

const NEXT_ICON = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6"></path>
  </svg>
`;

const TOUR_STEPS: TourStepDefinition[] = [
  {
    selector: '[data-tour="dashboard-header"]',
    title: "Welcome to your dashboard",
    description: "This is your operations overview. Use it to get a quick feel for activity across the property.",
    side: "bottom",
    align: "start",
  },
  {
    selector: '[data-tour="sidebar"]',
    title: "Use the HMS navigation",
    description: "The sidebar gives you fast access to every major department and operational module.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="dashboard-kpis"]',
    title: "Track key numbers",
    description: "These summary cards surface core operating counts such as reservations, rooms, and guests.",
    side: "bottom",
    align: "start",
  },
  {
    selector: '[data-tour="card-frontdesk"]',
    title: "Run front desk operations",
    description: "Manage check-ins, walk-ins, and room movement from the Front Desk module.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="card-reservations"]',
    title: "Manage reservations",
    description: "Use Reservations to manage upcoming arrivals, in-house stays, and booking activity.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="sidebar-rooms"]',
    title: "Configure rooms",
    description: "Rooms is where you manage room inventory, room types, and readiness for sale.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="sidebar-guests"]',
    title: "Keep guest records organized",
    description: "Guests helps your team maintain guest history, profiles, and property-wide context.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="card-accounts"]',
    title: "Handle billing and controls",
    description: "Accounts supports billing activity, revenue controls, and financial postings.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="card-restaurant-bar"]',
    title: "Manage F&B operations",
    description: "Food & Beverage centralizes restaurant, bar, room service, and outlet posting activity.",
    side: "top",
    align: "start",
  },
  {
    selector: '[data-tour="card-inventory"]',
    title: "Monitor stock and supply",
    description: "Inventory helps you track stock positions, supplier activity, and operational controls.",
    side: "top",
    align: "start",
  },
  {
    selector: '[data-tour="card-housekeeping"]',
    title: "Coordinate housekeeping",
    description: "Housekeeping keeps room cleaning flow and attendant assignments organized.",
    side: "top",
    align: "start",
  },
  {
    selector: '[data-tour="card-settings"]',
    title: "Adjust system settings",
    description: "Settings is where you manage branding, department access, integrations, and go-live setup.",
    side: "top",
    align: "start",
  },
];

function buildSteps(): DriveStep[] {
  return TOUR_STEPS.flatMap((step) => {
    const element = document.querySelector(step.selector);
    if (!element) return [];

    return [
      {
        element,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
        },
      },
    ];
  });
}

export default function HMSTour({ slug, initialStatus }: HMSTourProps) {
  const [tourStatus, setTourStatus] = useState(initialStatus);
  const [hasDismissedThisSession, setHasDismissedThisSession] = useState(false);

  const dismissForThisSession = useCallback(() => {
    setHasDismissedThisSession(true);
    window.dispatchEvent(new CustomEvent("hms-tour-finished", { detail: { status: "dismissed" } }));
  }, []);

  const persistTourStatus = useCallback(async (status: Extract<HotelDashboardTourStatus, "skipped" | "completed">) => {
    setHasDismissedThisSession(true);
    setTourStatus(status);
    window.dispatchEvent(new CustomEvent("hms-tour-finished", { detail: { status } }));

    try {
      await fetch("/api/hms/tour-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ slug, status }),
      });
    } catch (error) {
      console.error("Unable to persist HMS tour status", error);
    }
  }, [slug]);

  useEffect(() => {
    if (tourStatus !== "pending" || hasDismissedThisSession) return;

    const steps = buildSteps();
    if (!steps.length) return;

    const tour = driver({
      animate: true,
      allowClose: false,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      doneBtnText: "Done",
      nextBtnText: " ",
      overlayOpacity: 0.55,
      popoverClass: "xyvoo-hms-tour-popover",
      prevBtnText: " ",
      showButtons: ["previous", "next"],
      showProgress: true,
      smoothScroll: true,
      stagePadding: 14,
      stageRadius: 18,
      steps,
      onNextClick: (_element, _step, { driver: activeDriver }) => {
        if (activeDriver.isLastStep()) {
          void persistTourStatus("completed");
          activeDriver.destroy();
          return;
        }

        activeDriver.moveNext();
      },
      onPopoverRender: (popover, { driver: activeDriver }) => {
        popover.previousButton.innerHTML = PREV_ICON;
        popover.previousButton.setAttribute("aria-label", "Previous step");

        if (activeDriver.isLastStep()) {
          popover.nextButton.textContent = "Done";
          popover.nextButton.setAttribute("aria-label", "Finish tour");
        } else {
          popover.nextButton.innerHTML = NEXT_ICON;
          popover.nextButton.setAttribute("aria-label", "Next step");
        }

        if (!popover.wrapper.querySelector(".xyvoo-hms-tour-skip-row")) {
          const skipRow = document.createElement("div");
          skipRow.className = "xyvoo-hms-tour-skip-row";

          const skipTopButton = document.createElement("button");
          skipTopButton.type = "button";
          skipTopButton.className = "xyvoo-hms-tour-skip-top";
          skipTopButton.textContent = "Skip for now";
          skipTopButton.setAttribute("aria-label", "Skip tour for now");
          skipTopButton.addEventListener("click", () => {
            dismissForThisSession();
            activeDriver.destroy();
          });
          skipRow.append(skipTopButton);
          popover.wrapper.insertBefore(skipRow, popover.title);
        }

        if (popover.footer.querySelector(".xyvoo-hms-tour-dismiss-actions")) return;

        const dismissActions = document.createElement("div");
        dismissActions.className = "xyvoo-hms-tour-dismiss-actions";

        const neverShowAgainButton = document.createElement("button");
        neverShowAgainButton.type = "button";
        neverShowAgainButton.className = "xyvoo-hms-tour-never-show";
        neverShowAgainButton.textContent = "Never show again";
        neverShowAgainButton.addEventListener("click", () => {
          void persistTourStatus("skipped");
          activeDriver.destroy();
        });

        dismissActions.append(neverShowAgainButton);
        popover.footer.insertBefore(dismissActions, popover.footerButtons);
      },
      onPrevClick: (_element, _step, { driver: activeDriver }) => {
        activeDriver.movePrevious();
      },
    });

    const animationFrame = window.requestAnimationFrame(() => {
      tour.drive();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (tour.isActive()) {
        tour.destroy();
      }
    };
  }, [dismissForThisSession, hasDismissedThisSession, persistTourStatus, tourStatus]);

  return null;
}
