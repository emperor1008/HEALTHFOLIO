# Healthfolio — Deployment Readiness Checklist

Work through top to bottom. Every box must be checked before release.

## 1. Environment variables

- [ ] All names from the README table are configured on the host
      (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY` server-only, `STAFF_ROLE_ADMIN_KEY`
      server-only, AI vars optional).
- [ ] No secret uses the `NEXT_PUBLIC_` prefix.
- [ ] Values live only in the platform's secret store — never in the repo.
- [ ] `npm run secrets:scan` passes on the release commit.

## 2. Database

- [ ] `npx supabase db push` applied cleanly (migrations 001–022, all
      forward-only/additive).
- [ ] `npm run db:verify` passes — all required tables present, including
      reliability_metrics and region_config.
- [ ] Spot-check RLS: `select relname, relrowsecurity from pg_class where relname in
      ('care_requests','appointments','consultation_messages','pharmacy_stock_events',
      'reliability_metrics','region_config')` — all true.
- [ ] No client write policies on server-arbitrated tables (appointments,
      stock events, requests, responses, metrics).

## 3. Storage

- [ ] `documents` bucket exists and is **private**.
- [ ] Bucket policies: owner-scoped access only; no public reads.
- [ ] Signed URL TTLs confirmed (short-lived opens; single-use uploads).

## 4. HTTPS and headers

- [ ] Site served over HTTPS with HSTS.
- [ ] Supabase redirect allowlist includes only the production origin
      (no localhost in production config).

## 5. PWA / offline

- [ ] `public/manifest.webmanifest` reachable; icons resolve.
- [ ] `public/sw.js` registered; caches only non-sensitive app-shell assets
      (no API/document responses cached).
- [ ] Update flow verified: new SW activates and old caches are cleaned.

## 6. Build

- [ ] `npm run build` compiles successfully.
- [ ] Route budgets reviewed (largest First-Load JS reported in the release
      notes; heavy capture/consultation modules are code-split).

## 7. Tests

- [ ] `npm run lint` clean (no new warnings).
- [ ] `npm run typecheck` clean.
- [ ] `npm test` fully green (record the exact passed/failed counts in the
      release notes).
- [ ] `npm run test:e2e` green (Playwright; auto-starts a dev server on port
      3100 — desktop + mobile viewports). Requires the cached Chromium
      headless shell: `npx playwright install chromium --only-shell`.
- [ ] Optional `npm run ai:check` — AI features only; the core rural-care
      flow must work with AI unavailable.

## 8. Production smoke test (manual, ~10 minutes)

- [ ] Fresh anonymous session lands on an honest, calm home screen.
- [ ] With network throttled: save a care request offline → truthful
      "Saved on this device" → reload (persists) → reconnect → syncs once
      (no duplicate row server-side).
- [ ] Language switch en/hi/or renders everywhere, including the new request.
- [ ] Clinician (configured via runbook) accepts the request; patient confirms
      the appointment; duplicate taps do nothing.
- [ ] Consent grant → clinician opens one selected document via short-lived
      URL → revoke → further opens blocked.
- [ ] Pharmacy operator updates one stock status; patient lookup shows status
      + timestamp + freshness note.
- [ ] `/reliability` renders for staff and 403s for patients.

## 9. Rollback notes

- Migrations are additive and forward-only: rolling back the **app** is safe
  (older code ignores new tables/columns). Do **not** reverse migrations;
  instead re-deploy the previous application release.
- The service worker: deploy a bumped `sw.js` that deletes stale caches on
  activate to force clients back to a known-good shell.
- Keep the previous build artifacts for an instant re-deploy; document the
  artifact id in the release notes.
- Data written between releases remains intact (append-only design; no
  destructive migrations in the release path).
