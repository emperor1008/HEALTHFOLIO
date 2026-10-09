import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { hit } from "@/lib/api/rate-limit";
import { recordMetric } from "@/lib/metrics/service";
import { isMetricEvent, METRIC_METADATA_SCHEMAS } from "@/lib/metrics/events";

/**
 * POST /api/metrics/record — client-safe entry point for reliability metrics.
 *
 * Why this route exists: the offline sync engine runs in the browser and must
 * record `queue_item_*` metrics, but `@/lib/metrics/service` is server-only
 * (it opens the database). Importing it from client code dragged the whole
 * server data layer — `pg`, the session resolver, firebase-admin — into the
 * client bundle, so the engine now POSTs here instead. Behaviour is unchanged:
 * the same events, the same strict per-event metadata schemas, the same
 * "drop anything invalid" contract.
 *
 * Privacy & security:
 *   - Session required (401 otherwise); rate limited per IP.
 *   - Closed vocabulary: only the three offline-queue events are accepted.
 *   - Metadata is validated against the strict per-event schema, so payload
 *     fields (notes, names, free text) are rejected before any write.
 *   - `recordMetric` drops anything invalid; failures never surface to the
 *     caller because metrics are best-effort.
 */
export const dynamic = "force-dynamic";

const QUEUE_EVENTS = new Set<string>([
  "queue_item_created",
  "queue_item_synced",
  "queue_item_failed",
]);

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`metrics-record:${ip}`, 120, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_JSON" }, { status: 400 });
  }

  const event = (body as { event?: unknown }).event;
  if (typeof event !== "string" || !isMetricEvent(event)) {
    return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });
  }
  if (!QUEUE_EVENTS.has(event)) {
    return NextResponse.json({ code: "INVALID_EVENT" }, { status: 400 });
  }

  const metadata = (body as { metadata?: unknown }).metadata;
  const schema = METRIC_METADATA_SCHEMAS[event];
  if (!schema.safeParse(metadata ?? {}).success) {
    return NextResponse.json({ code: "INVALID_METADATA" }, { status: 400 });
  }

  const rawDuration = (body as { durationMs?: unknown }).durationMs;
  const durationMs =
    typeof rawDuration === "number" && Number.isInteger(rawDuration) && rawDuration >= 0
      ? rawDuration
      : null;

  await recordMetric({ event, durationMs, metadata: metadata ?? {} });
  return NextResponse.json({ ok: true });
}
