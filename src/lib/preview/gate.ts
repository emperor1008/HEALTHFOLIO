/**
 * Preview (demo) gate — the single server-side decision point that decides
 * whether the application may run WITHOUT a real sign-in session.
 *
 * Design rules (from the preview-mode spec):
 *  - `HF_DEMO_MODE` is SERVER-ONLY. This module never reads a `NEXT_PUBLIC_*`
 *    variable: a browser-set flag must never be able to disable authorization.
 *  - The default is OFF. Nothing here activates unless the flag is exactly
 *    "true".
 *  - Local development: allowed only when Node reports `development` AND the
 *    request arrives on a recognized loopback/local hostname.
 *  - Hosted preview: requires `HF_DEMO_MODE=true`, `HF_DEPLOYMENT_ENV=preview`
 *    AND an exact hostname match against the server-side allowlist
 *    (`HF_PREVIEW_HOSTS`, comma separated). An unset or non-matching allowlist
 *    fails CLOSED — we never guess the preview hostname.
 *  - Production (`NODE_ENV=production` without the preview designation, or a
 *    host that is not allowlisted) keeps requiring normal authentication even
 *    if someone flips the demo flag by accident.
 *
 * Everything is a pure function of explicit inputs so the truth table can be
 * unit-tested without a running server.
 */

export type PreviewDenyReason =
  | "demo_disabled"
  | "demo_flag_invalid"
  | "missing_host"
  | "host_not_allowlisted"
  | "allowlist_not_configured"
  | "not_local_development"
  | "preview_env_not_designated";

export interface PreviewGateInput {
  /** Raw `HF_DEMO_MODE`. */
  demoMode: string | undefined;
  /** Raw `HF_DEPLOYMENT_ENV`. */
  deploymentEnv: string | undefined;
  /** Raw `HF_PREVIEW_HOSTS` (comma separated exact hostnames). */
  previewHosts: string | undefined;
  /** `process.env.NODE_ENV`. */
  nodeEnv: string | undefined;
  /** Request `Host` header (may be null when no request context exists). */
  host: string | null;
}

export interface PreviewGate {
  enabled: boolean;
  /** Machine-readable denial reason; "ok" when enabled. */
  reason: PreviewDenyReason | "ok";
  /** Human-readable explanation for docs/UI. */
  detail: string;
}

/** Hostnames that always count as "this machine" for local development. */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** Strip the port (and IPv6 brackets) from a Host header value. */
export function hostnameOf(host: string | null): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end === -1 ? null : trimmed.slice(0, end + 1);
  }
  const colon = trimmed.lastIndexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

export function isLocalHostname(hostname: string | null): boolean {
  if (!hostname) return false;
  if (LOCAL_HOSTNAMES.has(hostname)) return true;
  // `*.localhost` is loopback by RFC 6761; `*.local` covers mDNS dev hosts.
  return hostname.endsWith(".localhost") || hostname.endsWith(".local");
}

const deny = (reason: PreviewDenyReason, detail: string): PreviewGate => ({
  enabled: false,
  reason,
  detail,
});

/**
 * Pure gate evaluation. Order matters: the flag is checked first, then the
 * environment designation, then the host.
 */
export function evaluatePreviewGate(input: PreviewGateInput): PreviewGate {
  const flag = (input.demoMode ?? "").trim().toLowerCase();
  if (flag === "" || flag === "false" || flag === "0" || flag === "off") {
    return deny("demo_disabled", "HF_DEMO_MODE is not enabled (default: disabled).");
  }
  if (flag !== "true" && flag !== "1" && flag !== "on") {
    return deny(
      "demo_flag_invalid",
      `HF_DEMO_MODE="${input.demoMode}" is not a recognized boolean; preview mode stays closed.`
    );
  }

  const hostname = hostnameOf(input.host);
  const deploymentEnv = (input.deploymentEnv ?? "").trim().toLowerCase();
  const nodeEnv = input.nodeEnv ?? "";
  const allowlist = (input.previewHosts ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (deploymentEnv === "preview") {
    // Hosted preview: explicit designation + exact server-side allowlist.
    if (allowlist.length === 0) {
      return deny(
        "allowlist_not_configured",
        "HF_DEPLOYMENT_ENV=preview but HF_PREVIEW_HOSTS is empty — the preview hostname must be allowlisted explicitly."
      );
    }
    if (!hostname) {
      return deny("missing_host", "No Host header available to verify the preview hostname.");
    }
    if (!allowlist.includes(hostname)) {
      return deny(
        "host_not_allowlisted",
        `Host "${hostname}" is not in HF_PREVIEW_HOSTS.`
      );
    }
    return {
      enabled: true,
      reason: "ok",
      detail: `Preview mode active for allowlisted host "${hostname}".`,
    };
  }

  if (deploymentEnv !== "" && deploymentEnv !== "development" && deploymentEnv !== "local") {
    return deny(
      "preview_env_not_designated",
      `HF_DEPLOYMENT_ENV="${input.deploymentEnv}" is not a preview designation; preview mode stays closed.`
    );
  }

  if (nodeEnv !== "development") {
    return deny(
      "not_local_development",
      `NODE_ENV="${nodeEnv}" — preview mode is only ever allowed in local development or on an allowlisted preview host.`
    );
  }
  if (!hostname) {
    return deny("missing_host", "No Host header available to verify a local development host.");
  }
  if (!isLocalHostname(hostname)) {
    return deny(
      "host_not_allowlisted",
      `Host "${hostname}" is not a recognized local-development hostname.`
    );
  }
  return {
    enabled: true,
    reason: "ok",
    detail: `Preview mode active for local development host "${hostname}".`,
  };
}

/**
 * Environment-only half of the gate (no request context). Used by the
 * synchronous data-layer selection, which cannot await `headers()`.
 *
 * It is deliberately STRICTER than the full gate: it can only ever be true
 * where the full gate could also be true, so selecting the local database can
 * never happen on a deployment that could not also bypass sign-in.
 */
export function demoEnvEnabled(): boolean {
  const flag = (process.env.HF_DEMO_MODE ?? "").trim().toLowerCase();
  if (flag !== "true" && flag !== "1" && flag !== "on") return false;

  const deploymentEnv = (process.env.HF_DEPLOYMENT_ENV ?? "").trim().toLowerCase();
  if (deploymentEnv === "preview") {
    // Requires an explicitly configured allowlist — never guessed.
    return (process.env.HF_PREVIEW_HOSTS ?? "").split(",").some((h) => h.trim() !== "");
  }
  if (deploymentEnv !== "" && deploymentEnv !== "development" && deploymentEnv !== "local") {
    return false;
  }
  return process.env.NODE_ENV === "development";
}

/** Full gate for the current request (reads the Host header). */
export async function getPreviewGate(): Promise<PreviewGate> {
  let host: string | null = null;
  try {
    const { headers } = await import("next/headers");
    host = (await headers()).get("host");
  } catch {
    host = null; // no request context (build, script) → fail closed
  }
  return evaluatePreviewGate({
    demoMode: process.env.HF_DEMO_MODE,
    deploymentEnv: process.env.HF_DEPLOYMENT_ENV,
    previewHosts: process.env.HF_PREVIEW_HOSTS,
    nodeEnv: process.env.NODE_ENV,
    host,
  });
}

/** Convenience: is preview mode active for the current request? */
export async function isPreviewMode(): Promise<boolean> {
  return (await getPreviewGate()).enabled;
}
