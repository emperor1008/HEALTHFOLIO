/**
 * Phase 6 integration harness — PostgREST transport shim.
 *
 * The implementation moved to src/lib/db/postgrest-shim.ts so the local
 * preview data provider and this harness execute the identical SQL
 * generation path. This module stays as the harness-facing re-export so the
 * existing integration tests keep their import path.
 */
export * from "@/lib/db/postgrest-shim";
