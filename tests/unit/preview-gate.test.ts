/**
 * Preview gate — truth table.
 *
 * The gate is the ONLY thing standing between "anyone can open the app" and
 * "normal authentication applies", so its decision table is pinned here:
 * off by default, local-only for development, exact-host allowlist for a
 * hosted preview, and fail-closed for anything that cannot be verified.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluatePreviewGate,
  hostnameOf,
  isLocalHostname,
  demoEnvEnabled,
  type PreviewGateInput,
} from "@/lib/preview/gate";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function gate(overrides: Partial<PreviewGateInput> = {}) {
  return evaluatePreviewGate({
    demoMode: "true",
    deploymentEnv: undefined,
    previewHosts: undefined,
    nodeEnv: "development",
    host: "localhost:3000",
    ...overrides,
  });
}

describe("evaluatePreviewGate — the flag", () => {
  it("is closed by default (no flag at all)", () => {
    expect(gate({ demoMode: undefined }).enabled).toBe(false);
    expect(gate({ demoMode: undefined }).reason).toBe("demo_disabled");
  });

  it("is closed for false-ish values", () => {
    for (const value of ["false", "0", "off", "", "  "]) {
      expect(gate({ demoMode: value }).enabled).toBe(false);
    }
  });

  it("fails closed on an unrecognised flag value instead of guessing", () => {
    const result = gate({ demoMode: "yes-please" });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("demo_flag_invalid");
  });

  it("opens for true / 1 / on (case-insensitive)", () => {
    for (const value of ["true", "TRUE", "1", "on"]) {
      expect(gate({ demoMode: value }).enabled).toBe(true);
    }
  });
});

describe("evaluatePreviewGate — local development", () => {
  it("opens on a loopback host under NODE_ENV=development", () => {
    expect(gate().enabled).toBe(true);
    expect(gate({ host: "127.0.0.1:3000" }).enabled).toBe(true);
    expect(gate({ host: "[::1]:3000" }).enabled).toBe(true);
    expect(gate({ host: "app.localhost" }).enabled).toBe(true);
  });

  it("stays closed outside local development", () => {
    for (const nodeEnv of ["production", "test", ""]) {
      const result = gate({ nodeEnv });
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe("not_local_development");
    }
  });

  it("stays closed for a non-local host", () => {
    const result = gate({ host: "healthfolio.example.com" });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("host_not_allowlisted");
  });

  it("stays closed when there is no Host header to verify", () => {
    const result = gate({ host: null });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("missing_host");
  });
});

describe("evaluatePreviewGate — hosted preview", () => {
  const preview = {
    deploymentEnv: "preview",
    previewHosts: "preview.freebuff.dev, PR-42.preview.freebuff.dev",
    nodeEnv: "production",
  };

  it("opens only for an exactly allowlisted hostname", () => {
    expect(gate({ ...preview, host: "preview.freebuff.dev" }).enabled).toBe(
      true,
    );
    expect(
      gate({ ...preview, host: "PR-42.preview.freebuff.dev:443" }).enabled,
    ).toBe(true);
  });

  it("closes for any other hostname — the preview host is never guessed", () => {
    const result = gate({ ...preview, host: "evil.example.com" });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("host_not_allowlisted");
  });

  it("closes when the allowlist was never configured", () => {
    const result = gate({
      ...preview,
      previewHosts: "",
      host: "preview.freebuff.dev",
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("allowlist_not_configured");
  });

  it("closes when the deployment is not designated a preview", () => {
    const result = gate({
      deploymentEnv: "production",
      previewHosts: "preview.freebuff.dev",
      nodeEnv: "production",
      host: "preview.freebuff.dev",
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("preview_env_not_designated");
  });

  it("production with an accidental demo flag stays closed", () => {
    const result = gate({
      deploymentEnv: undefined,
      previewHosts: undefined,
      nodeEnv: "production",
      host: "healthfolio.example.com",
    });
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("not_local_development");
  });
});

describe("hostname helpers", () => {
  it("strips the port and lowercases", () => {
    expect(hostnameOf("Localhost:3000")).toBe("localhost");
    expect(hostnameOf("Example.COM")).toBe("example.com");
    expect(hostnameOf("[::1]:3000")).toBe("[::1]");
    expect(hostnameOf("host:8080:extra")).toBe("host:8080");
    expect(hostnameOf(null)).toBeNull();
    expect(hostnameOf("   ")).toBeNull();
  });

  it("recognizes loopback and mDNS-style dev hosts only", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("[::1]")).toBe(true);
    expect(isLocalHostname("api.localhost")).toBe(true);
    expect(isLocalHostname("printer.local")).toBe(true);
    expect(isLocalHostname("example.com")).toBe(false);
    expect(isLocalHostname("localhost.evil.com")).toBe(false);
  });
});

describe("demoEnvEnabled (environment half of the gate)", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is false without the flag, regardless of anything else", () => {
    process.env.HF_DEMO_MODE = "false";
    process.env.HF_DEPLOYMENT_ENV = "preview";
    process.env.HF_PREVIEW_HOSTS = "preview.test";
    expect(demoEnvEnabled()).toBe(false);
  });

  it("is false in production even with the flag set", () => {
    process.env.HF_DEMO_MODE = "true";
    process.env.HF_DEPLOYMENT_ENV = "";
    expect(demoEnvEnabled()).toBe(false);
  });

  it("is true only with the flag AND a preview designation AND an allowlist", () => {
    process.env.HF_DEMO_MODE = "true";
    process.env.HF_DEPLOYMENT_ENV = "preview";
    process.env.HF_PREVIEW_HOSTS = "";
    expect(demoEnvEnabled()).toBe(false);
    process.env.HF_PREVIEW_HOSTS = "preview.test";
    expect(demoEnvEnabled()).toBe(true);
  });
});
