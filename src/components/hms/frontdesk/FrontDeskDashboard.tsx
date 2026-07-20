import { Suspense } from "react";
import type { FrontDeskNavArea, FrontDeskPageBlock } from "@/lib/hms/frontdesk-capabilities";
import { FRONT_DESK_AREA_HERO } from "@/lib/hms/frontdesk-capabilities";
import type { FrontDeskBoardData } from "@/lib/hms/front-desk-board";
import { FrontDeskCheckInSuccessBanner } from "./FrontDeskCheckInSuccessBanner";
import { FrontDeskOperationalBoard } from "./board/FrontDeskOperationalBoard";
import { FrontDeskCapabilityCard } from "./FrontDeskCapabilityCard";
import { FrontDeskLiveKpiSection } from "./board/FrontDeskLiveKpiSection";
import { FrontDeskSectionHeader } from "./FrontDeskSectionHeader";
import { FrontDeskWorkflowDivider } from "./FrontDeskWorkflowDivider";

function capabilityHref(slug: string, key: string): string {
  const overrides: Record<string, string> = {
    "room-status-board": `/hms/${slug}/frontdesk/rooms`,
    "change-room-assignment": `/hms/${slug}/frontdesk/rooms?action=change-assignment`,
    "block-room": `/hms/${slug}/frontdesk/rooms?action=block`,
    "remote-unlock": `/hms/${slug}/frontdesk/rooms?action=unlock`,
    "lost-key-reissue": `/hms/${slug}/frontdesk/rooms?action=key-reissue`,
    "room-move": `/hms/${slug}/frontdesk/rooms?action=move`,
    "connecting-rooms": `/hms/${slug}/frontdesk/rooms?action=connecting`,
    "room-operations-overview": `/hms/${slug}/frontdesk`,
    "guest-profile": `/hms/${slug}/guests`,
    "guest-profile-load": `/hms/${slug}/guests`,
    "priority-clean-request": `/hms/${slug}/frontdesk/rooms?action=priority-clean`,
    "express-check-out": `/hms/${slug}/frontdesk/checkout`,
    "arrivals-kpi": `/hms/${slug}/frontdesk#fd-movement-timeline`,
    "departures-kpi": `/hms/${slug}/frontdesk#fd-movement-timeline`,
    "overdue-checkouts": `/hms/${slug}/frontdesk#fd-movement-timeline`,
    "view-live-folio": `/hms/${slug}/frontdesk/folio`,
    "post-manual-charge": `/hms/${slug}/frontdesk/folio`,
    "apply-discount": `/hms/${slug}/frontdesk/folio`,
    "split-folio": `/hms/${slug}/frontdesk/folio`,
    "transfer-charge": `/hms/${slug}/frontdesk/folio`,
    "mid-stay-payment": `/hms/${slug}/frontdesk/folio`,
    "preview-share-bill": `/hms/${slug}/frontdesk/folio`,
    "foreign-currency": `/hms/${slug}/frontdesk/folio`,
    "corporate-billing": `/hms/${slug}/frontdesk/folio`,
    "travel-agent-commission": `/hms/${slug}/frontdesk/folio`,
    "cash-float": `/hms/${slug}/frontdesk/folio`,
    "final-folio-review": `/hms/${slug}/frontdesk/checkout`,
    "settle-payment": `/hms/${slug}/frontdesk/checkout`,
    "void-charge": `/hms/${slug}/frontdesk/folio`,
    "send-receipt": `/hms/${slug}/frontdesk/checkout`,
    "pre-arrival-list": `/hms/${slug}/frontdesk/arrivals`,
    "pre-assign-rooms": `/hms/${slug}/frontdesk/arrivals`,
    "check-in-search": `/hms/${slug}/frontdesk/arrivals`,
    "room-assignment": `/hms/${slug}/frontdesk/arrivals`,
    "payment-capture": `/hms/${slug}/frontdesk/folio`,
    "open-folio": `/hms/${slug}/frontdesk/folio`,
    "walk-in-booking": `/hms/${slug}/frontdesk/check-in`,
    "special-requests-confirm": `/hms/${slug}/frontdesk/arrivals`,
  };
  return overrides[key] ?? `/hms/${slug}/frontdesk/wip/${key}`;
}

export function FrontDeskDashboard({
  slug,
  area,
  blocks,
  inventoryRoomCount,
  boardData,
}: {
  slug: string;
  area: FrontDeskNavArea;
  blocks: FrontDeskPageBlock[];
  /** Shown on overview only — registered room inventory from tenant profile. */
  inventoryRoomCount?: number;
  boardData?: FrontDeskBoardData;
}) {
  const hero = FRONT_DESK_AREA_HERO[area];
  const showInventory = area === "overview" && inventoryRoomCount != null && inventoryRoomCount > 0;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8 sm:px-8">
      <section
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm shadow-slate-200/30"
        aria-labelledby="fd-hero-title"
      >
        <div className="px-6 py-6 sm:px-7 sm:py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Front desk</p>
          <h1 id="fd-hero-title" className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {hero.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{hero.description}</p>
          {showInventory ? (
            <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
              <span className="text-slate-500">Registered inventory on file</span>
              <span className="font-semibold tabular-nums text-slate-900">{inventoryRoomCount}</span>
              <span className="text-slate-500">rooms</span>
            </div>
          ) : null}
        </div>
      </section>

      {area === "overview" ? (
        <Suspense fallback={null}>
          <FrontDeskCheckInSuccessBanner />
        </Suspense>
      ) : null}

      {area === "overview" && boardData ? (
        <Suspense fallback={null}>
          <FrontDeskOperationalBoard slug={slug} data={boardData} />
        </Suspense>
      ) : null}

      <div className="mt-6 space-y-6">
        {blocks.map((block) => {
          if (block.type === "divider") {
            return (
              <FrontDeskWorkflowDivider
                key={`div-${block.area}-${block.label}`}
                label={block.label}
              />
            );
          }

          const sectionDomId = `fd-section-${block.id}`;

          return (
            <section
              key={block.id}
              className="scroll-mt-6 overflow-hidden rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-sm shadow-slate-200/25 sm:px-7 sm:py-7"
              aria-labelledby={sectionDomId}
            >
              <FrontDeskSectionHeader id={sectionDomId} eyebrow={block.eyebrow} title={block.title} />
              {block.id === "dashboard-kpis" && boardData ? (
                <>
                  <FrontDeskLiveKpiSection tiles={boardData.kpiTiles} />
                  {showInventory ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Inventory on file: {inventoryRoomCount} rooms · Rooms ready KPI uses live unit status.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {block.cards.map((card) => {
                    const href = capabilityHref(slug, card.key);
                    return (
                      <FrontDeskCapabilityCard
                        key={card.key}
                        title={card.title}
                        subtitle={card.subtitle}
                        accent={card.accent}
                        href={href}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
