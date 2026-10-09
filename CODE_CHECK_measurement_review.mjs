import { readFileSync, existsSync } from 'node:fs';

const MIGRATION_PATH = 'supabase/migrations/007_measurement_review_rpc.sql';
const ROUTE_PATH = 'src/app/api/health-tracking/measurements/[id]/route.ts';

function read(path) {
  if (!existsSync(path)) throw new Error('missing: ' + path);
  return readFileSync(path, 'utf8');
}

let failed = false;

const migration = read(MIGRATION_PATH);
const route = read(ROUTE_PATH);

const checks = [
  ['migration has review_measurement signature', /CREATE OR REPLACE FUNCTION review_measurement/.test(migration)],
  ['migration has p_base_updated_at param', /p_base_updated_at timestamptz DEFAULT NULL/.test(migration)],
  ['migration has FOR UPDATE', /\bFOR UPDATE\b/.test(migration)],
  ['migration returns VERSION_CONFLICT', /'errorCode',\s*'VERSION_CONFLICT'/.test(migration)],
  ['migration no longer says only "Fetch and verify ownership"', !/^\-\- Fetch and verify ownership$/.test(migration)],
  ['migration has concurrency comment', /\boptimistic concurrency control/i.test(migration)],
  ['migration audit comment excludes clinical values wording', !/safe — no medical values/.test(migration)],
  ['route passes p_base_updated_at from measurement.updated_at', /p_base_updated_at:\s*measurement\.updated_at\s*\?\?\s*null/.test(route)],
];

for (const [name, ok] of checks) {
  console.log(ok ? 'OK ' : 'FAIL', name);
  if (!ok) failed = true;
}

for (const path of [MIGRATION_PATH, ROUTE_PATH]) {
  const content = read(path);
  if (!/review_measurement/.test(content)) {
    console.log('FAIL', path, 'no longer references review_measurement');
    failed = true;
  }
}

if (!/GRANT EXECUTE ON FUNCTION review_measurement TO authenticated/.test(migration)) {
  console.log('FAIL', 'migration missing GRANT EXECUTE for review_measurement');
  failed = true;
}

console.log('\nSUMMARY', failed ? 'FAIL' : 'PASS');
if (failed) {
  process.exit(1);
}
