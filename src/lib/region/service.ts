/**
 * Region-config service — server-side only. Reads return the safe
 * unconfigured default for unknown regions; writes require a coordinator
 * role resolved from facility_memberships (never client-asserted).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffIdentity } from "@/lib/staff/roles";
import { UNCONFIGURED_REGION, validateRegionConfig, type RegionConfig } from "./config";

export async function getRegionConfig(region: string | null): Promise<RegionConfig> {
  if (!region) return UNCONFIGURED_REGION;
  try {
    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("region_config")
      .select("config")
      .eq("region", region)
      .maybeSingle();
    if (error || !data) return UNCONFIGURED_REGION;
    const parsed = validateRegionConfig(data.config);
    return parsed ?? UNCONFIGURED_REGION;
  } catch {
    return UNCONFIGURED_REGION;
  }
}

export async function upsertRegionConfig(
  userId: string,
  input: unknown,
): Promise<{ ok: boolean; reason?: string }> {
  // Authorization: only a coordinator (or higher) may configure regions.
  const identity = await getStaffIdentity(userId);
  if (!identity || identity.role !== "coordinator") {
    return { ok: false, reason: "forbidden" };
  }

  const config = validateRegionConfig(input);
  if (!config) return { ok: false, reason: "invalid" };

  const admin = await createAdminClient();
  const { error } = await admin.from("region_config").upsert(
    { region: config.region, config, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "region" },
  );
  if (error) return { ok: false, reason: "storage_failed" };
  return { ok: true };
}
