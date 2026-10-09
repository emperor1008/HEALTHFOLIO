/**
 * Offline Health Card data model (Phase 2).
 *
 * A deliberately small, typed view of the patient's ESSENTIAL information —
 * never raw database rows. The card contains only what a rural care
 * encounter actually needs offline:
 *
 *   profile (name + preferred language), explicitly recorded allergies and
 *   conditions, active medicines, and a short recent-care summary.
 *
 * Full medical documents are NOT cached (that is an explicit user toggle in
 * the UI that stays off, and this model has nowhere to put them).
 *
 * Every boundary crossing (server response, decrypted local snapshot) is
 * validated with these schemas — a corrupt or tampered snapshot degrades to
 * "no card", never to a crash or silently wrong data.
 */

import { z } from "zod";
import { LANGUAGES } from "@/lib/i18n";

/** Bump when the persisted shape changes (migration of local data = clear). */
export const HEALTH_CARD_SCHEMA_VERSION = 1;

/** Snapshots older than this are shown with the stale-information note. */
export const HEALTH_CARD_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export const HealthCardFactsSchema = z.object({
  allergies: z.array(z.string().trim().min(1).max(120)).max(50),
  conditions: z.array(z.string().trim().min(1).max(120)).max(50),
});
export type HealthCardFacts = z.infer<typeof HealthCardFactsSchema>;

export const RecentCareItemSchema = z.object({
  id: z.string().min(1).max(64),
  /** ISO date (yyyy-mm-dd) or ISO timestamp; null when never dated. */
  date: z.string().max(40).nullable(),
  kind: z.enum(["care_request", "appointment"]),
  status: z.string().max(40),
  /** Short plain-language label (already truncated server-side). */
  label: z.string().max(200),
});
export type RecentCareItem = z.infer<typeof RecentCareItemSchema>;

export const OfflineHealthCardSchema = z.object({
  schemaVersion: z.number().int(),
  /**
   * Server-side content version: the newest source timestamp used to build
   * the card (or the fetch time when no source carries a timestamp). The
   * client compares it against its saved snapshot to detect a refresh.
   */
  version: z.string().min(1).max(64),
  /** When this content was produced by the server. */
  updatedAt: z.string().datetime(),
  profile: z.object({
    displayName: z.string().max(160).nullable(),
    preferredLanguage: z.enum(LANGUAGES),
  }),
  allergies: z.array(z.string().max(120)).max(50),
  conditions: z.array(z.string().max(120)).max(50),
  medications: z.array(z.string().max(160)).max(80),
  recentCare: z.array(RecentCareItemSchema).max(10),
});

export type OfflineHealthCard = z.infer<typeof OfflineHealthCardSchema>;

/** Metadata kept NEXT TO (never inside) the encrypted payload. */
export interface HealthCardSnapshotMeta {
  /** Better Auth user id the snapshot belongs to (owner binding). */
  ownerId: string;
  /** Local save time — drives the stale indicator without decrypting. */
  savedAt: string;
  /** Content version of the saved card. */
  version: string;
  schemaVersion: number;
}

export interface HealthCardSnapshot extends HealthCardSnapshotMeta {
  card: OfflineHealthCard;
}

export type SnapshotFreshness = "current" | "stale";

/** Classify a saved snapshot's freshness. Pure — caller supplies `now`. */
export function classifySnapshotFreshness(
  savedAtIso: string,
  nowMs: number,
  staleAfterMs: number = HEALTH_CARD_STALE_AFTER_MS
): SnapshotFreshness {
  const saved = Date.parse(savedAtIso);
  if (!Number.isFinite(saved)) return "stale";
  return nowMs - saved > staleAfterMs ? "stale" : "current";
}

/** Does a fetched card differ from the saved snapshot in content? */
export function cardContentDiffers(a: OfflineHealthCard | null, b: OfflineHealthCard): boolean {
  if (!a) return true;
  return a.version !== b.version;
}

/** Validate unknown data (server response or decrypted blob) into a card. */
export function parseOfflineHealthCard(input: unknown): OfflineHealthCard | null {
  const parsed = OfflineHealthCardSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
