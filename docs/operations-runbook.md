# Healthfolio — Operations Runbook

Practical procedures for running the platform. Commands run from the repo root.

## 0. Baseline setup

```bash
npm install
npx supabase db push      # applies migrations 001–022 in order
npm run db:verify         # asserts all required tables exist
cp .env.example .env.local  # if present; otherwise create .env.local (names in README)
npm run dev               # http://localhost:3000
```

## 1. Configure a clinician

1. Get the clinician's Supabase `auth.users.id` and facility id.
2. Assign the membership server-side (admin key in server env):

```bash
curl -X POST http://localhost:3000/api/staff/roles \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $STAFF_ROLE_ADMIN_KEY" \
  -d '{"user_id":"<uuid>","facility_id":"<uuid>","role":"clinician"}'
```

3. Clinician opens `/staff`, creates their profile (name, specialty,
   languages, supported modes) and sets availability to **Available**.
4. Freshness: availability rows older than the configurable threshold are
   excluded from patient-facing "Available care options" automatically; the
   clinician (or a coordinator) just updates their status to refresh it.

## 2. Configure a pharmacy

1. Insert the pharmacy row (verified state only after a real verification):

```sql
INSERT INTO pharmacies (name, service_area_text, languages, verification_state)
VALUES ('<real pharmacy name>', '<area text>', '{en,hi}', 'pending');
-- after the real verification workflow by an authorized coordinator:
UPDATE pharmacies SET verification_state='verified', verified_by='<admin uuid>',
  verified_at=now() WHERE id='<pharmacy uuid>';
```

2. Assign staff (server-side, same admin-key pattern as Part 3; roles live in
   `pharmacy_memberships` — `operator` or `manager`).
3. Operator opens `/pharmacy` and confirms stock. Patients see results only
   for **verified** pharmacies with at least one recorded stock event.

## 3. Configure a region (no code changes)

1. Coordinator prepares the config JSON (schema in
   `src/lib/region/config.ts`: languages, service area, emergency guidance,
   appointment hours, freshness thresholds, consultation modes, feature flags,
   help contact).
2. Insert/update it:

```sql
INSERT INTO region_config (region, config, updated_by)
VALUES ('<region-slug>', '<config json>', '<coordinator uuid>')
ON CONFLICT (region) DO UPDATE
  SET config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = now();
```

3. Unconfigured regions automatically get safe generic defaults (no fabricated
   phone numbers or locations). Nothing region-specific is hard-coded.

## 4. Test offline synchronization

**Production-safe (real conditions):** DevTools → Network → Offline; perform a
patient/staff action; observe truthful "Saved on this device" state; reload the
page (items persist); go online; watch automatic sync and status change to
"Synced/Sent/Updated" only after the server acknowledges.

**Resilience test mode (development builds only):** the dev panel (bottom
right) offers Offline / Slow 2G / Slow 3G / Server timeout / Drop during sync.
Profiles delay or drop requests exactly like a bad network; queued actions
follow their real retry path. It never fakes server success and never writes
data; it is disabled in production builds.

## 5. Handle failed queue items

1. Patient/staff screens show **Needs attention** only for genuine failures.
2. The queue list offers **Retry** (resets backoff, replays with the SAME
   idempotency key — the server deduplicates) and **View details**.
3. **Remove local draft** requires explicit confirmation and only affects the
   local copy; the item is never silently deleted.
4. If retries exhaust (5 automatic attempts), the item parks in
   `requires_attention` — visible, retryable, never lost.

## 6. Validate stock freshness

- Thresholds come from region config (defaults: fresh < 24h, aging < 72h,
  stale < 7d, expired ≥ 7d).
- Patient view demotes stale "available" to **"Not recently confirmed"** and
  hides expired availability as current — enforced by
  `src/lib/pharmacy/freshness.ts` and its tests.
- Audit: `pharmacy_audit_events` shows the full update history per pharmacy.

## 7. Rotate secrets

1. Generate the new value in Supabase dashboard / key manager.
2. Update `.env.local` (or the hosting platform's env settings) — **names
   only** are documented in the README; values never enter Git.
3. Restart the server; run `npm run secrets:scan` to confirm nothing leaked
   into tracked files.
4. For `STAFF_ROLE_ADMIN_KEY`: rotate by updating the server env; in-flight
   role-assignment requests with the old key fail closed (401).

## 8. Remove staff access

```sql
DELETE FROM facility_memberships WHERE user_id='<uuid>' AND facility_id='<facility uuid>';
DELETE FROM pharmacy_memberships WHERE user_id='<uuid>' AND pharmacy_id='<pharmacy uuid>';
```

Access ends at the next request (membership is re-resolved per call; there is
no cached role). Historical audit rows are retained.

## 9. Verification gate (run before every release)

```bash
npm run lint && npm run typecheck && npm test && npm run build \
  && npm run secrets:scan && npm run db:verify
```

The platform's core safety/routing flow must never depend on the optional AI
check (`npm run ai:check`); AI unavailability degrades only AI-specific
features, never the offline queue, triage, appointments, or pharmacy flow.
