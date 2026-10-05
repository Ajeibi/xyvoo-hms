import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isOnboardingStep, PLAN_FEE_RATES, type OnboardingProgress, type StorePlan } from "./onboarding";
import { parseSiteOverrides, siteOverridesSchema, type SiteOverrides } from "./schema";
import { DEFAULT_TEMPLATE_SLUG, isStorefrontTemplateSlug, type StorefrontTemplateSlug } from "./templates";

export type StoreSiteStatus = "draft" | "live" | "paused";

export type StoreSiteRecord = {
  tenantId: string;
  templateSlug: StorefrontTemplateSlug;
  draft: SiteOverrides;
  published: SiteOverrides | null;
  status: StoreSiteStatus;
  publishedVersion: number;
  publishedAt: string | null;
  updatedAt: string;
};

type SiteRow = {
  tenant_id: string;
  template_slug: string;
  draft: unknown;
  published: unknown;
  status: StoreSiteStatus;
  published_version: number;
  published_at: string | null;
  updated_at: string;
};

function storeDb(client?: SupabaseClient) {
  return (client ?? createServerSupabaseClient()).schema("store");
}

function mapSite(row: SiteRow): StoreSiteRecord {
  return {
    tenantId: row.tenant_id,
    templateSlug: isStorefrontTemplateSlug(row.template_slug) ? row.template_slug : DEFAULT_TEMPLATE_SLUG,
    draft: parseSiteOverrides(row.draft),
    published: row.published == null ? null : parseSiteOverrides(row.published),
    status: row.status,
    publishedVersion: row.published_version,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export async function getStoreSite(tenantId: string): Promise<StoreSiteRecord | null> {
  const { data } = await storeDb()
    .from("sites")
    .select("tenant_id, template_slug, draft, published, status, published_version, published_at, updated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return data ? mapSite(data as SiteRow) : null;
}

/**
 * Replaces the given top-level sections of the draft (theme, brand, sections,
 * navigation, content, seo); sections not passed are left as they are.
 * Throws a ZodError if the patch is invalid.
 */
export async function saveSiteDraft(tenantId: string, patch: SiteOverrides): Promise<StoreSiteRecord> {
  const validPatch = siteOverridesSchema.parse(patch);
  const current = await getStoreSite(tenantId);
  if (!current) throw new Error("This store has no site record.");

  const { data, error } = await storeDb()
    .from("sites")
    .update({ draft: { ...current.draft, ...validPatch } })
    .eq("tenant_id", tenantId)
    .select("tenant_id, template_slug, draft, published, status, published_version, published_at, updated_at")
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to save the draft.");
  return mapSite(data as SiteRow);
}

export async function setSiteTemplate(tenantId: string, templateSlug: StorefrontTemplateSlug) {
  const { error } = await storeDb().from("sites").update({ template_slug: templateSlug }).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

export async function getOnboardingProgress(tenantId: string): Promise<OnboardingProgress | null> {
  const { data } = await storeDb()
    .from("onboarding")
    .select("current_step, completed_steps, completed_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return null;
  return {
    currentStep: isOnboardingStep(data.current_step) ? data.current_step : "basics",
    completedSteps: ((data.completed_steps as string[]) || []).filter(isOnboardingStep),
    completedAt: data.completed_at,
  };
}

export async function saveOnboardingProgress(tenantId: string, progress: OnboardingProgress) {
  const { error } = await storeDb()
    .from("onboarding")
    .update({
      current_step: progress.currentStep,
      completed_steps: progress.completedSteps,
      completed_at: progress.completedAt,
    })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

/**
 * Creates the per-store rows a new store needs: a draft site on the chosen
 * template, wizard progress (remembering any plan/template from the marketing
 * link), an empty business profile and a Free subscription. Safe to re-run.
 */
export async function provisionStoreDefaults(
  tenantId: string,
  options: { templateSlug?: string | null; plan?: StorePlan | null } = {},
  client?: SupabaseClient,
) {
  const db = storeDb(client);
  const templateSlug = isStorefrontTemplateSlug(options.templateSlug) ? options.templateSlug : DEFAULT_TEMPLATE_SLUG;
  const intent = {
    ...(isStorefrontTemplateSlug(options.templateSlug) ? { template: options.templateSlug } : {}),
    ...(options.plan ? { plan: options.plan } : {}),
  };

  const results = await Promise.all([
    db.from("sites").upsert({ tenant_id: tenantId, template_slug: templateSlug }, { onConflict: "tenant_id", ignoreDuplicates: true }),
    db.from("onboarding").upsert({ tenant_id: tenantId, data: intent }, { onConflict: "tenant_id", ignoreDuplicates: true }),
    db.from("business_profile").upsert({ tenant_id: tenantId }, { onConflict: "tenant_id", ignoreDuplicates: true }),
    db
      .from("subscriptions")
      .upsert({ tenant_id: tenantId, plan: "free", platform_fee_rate: PLAN_FEE_RATES.free }, { onConflict: "tenant_id", ignoreDuplicates: true }),
  ]);

  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/** Throws away unpublished edits: the draft goes back to what's live (or to the template defaults if nothing is). */
export async function discardSiteDraft(tenantId: string) {
  const site = await getStoreSite(tenantId);
  if (!site) throw new Error("This store has no site record.");
  const { error } = await storeDb().from("sites").update({ draft: site.published ?? {} }).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}

export type SiteVersionSummary = { version: number; templateSlug: string; createdAt: string };

export async function listSiteVersions(tenantId: string, limit = 20): Promise<SiteVersionSummary[]> {
  const { data, error } = await storeDb()
    .from("site_versions")
    .select("version, template_slug, created_at")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((v) => ({ version: v.version, templateSlug: v.template_slug, createdAt: v.created_at }));
}

/** Copies an earlier published version into the draft, to review and publish again. Nothing goes live until then. */
export async function restoreSiteVersion(tenantId: string, version: number) {
  const { data, error } = await storeDb()
    .from("site_versions")
    .select("snapshot, template_slug")
    .eq("tenant_id", tenantId)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const { error: updateError } = await storeDb()
    .from("sites")
    .update({ draft: parseSiteOverrides(data.snapshot), template_slug: isStorefrontTemplateSlug(data.template_slug) ? data.template_slug : DEFAULT_TEMPLATE_SLUG })
    .eq("tenant_id", tenantId);
  if (updateError) throw new Error(updateError.message);
  return true;
}
