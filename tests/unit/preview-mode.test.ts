/**
 * Regression tests for the database-auth migration + temporary preview mode.
 *
 * These pin the three invariants that are easy to reintroduce by accident:
 *  1. Supabase Auth is gone as an authentication provider (no `supabase.auth.*`
 *     call sites anywhere in application code).
 *  2. Authorization is never decided from a browser-visible variable.
 *  3. The /preview directory only lists routes that actually exist — and lists
 *     all of them.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Drop comment lines so documentation mentioning a removed API is allowed. */
function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (t.startsWith("//")) return false;
      if (t.startsWith("*")) return false;
      if (t.startsWith("/*")) return false;
      return true;
    })
    .join("\n");
}

describe("Supabase Auth removal", () => {
  it("has no supabase.auth.* call sites left in application code", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (codeOnly(fs.readFileSync(file, "utf8")).includes("supabase.auth.")) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("resolves identity through the centralized session seams instead", () => {
    const files = walk(path.join(SRC, "app", "api"));
    const withGuards = files.filter((f) => {
      const code = codeOnly(fs.readFileSync(f, "utf8"));
      return (
        code.includes("@/lib/auth-helpers") ||
        code.includes("@/lib/auth-session") ||
        code.includes("@/lib/api/auth-guard")
      );
    });
    // Every data-touching API route must go through a shared auth helper.
    expect(withGuards.length).toBeGreaterThan(40);
  });
});

describe("preview mode cannot be enabled from the browser", () => {
  it("never reads a NEXT_PUBLIC demo variable", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (fs.readFileSync(file, "utf8").includes("NEXT_PUBLIC_HF_DEMO")) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the gate server-side and fail-closed", () => {
    const gate = fs.readFileSync(
      path.join(SRC, "lib", "preview", "gate.ts"),
      "utf8",
    );
    expect(gate).toContain("demo_disabled");
    expect(gate).toContain("not_local_development");
    expect(gate).toContain("host_not_allowlisted");
    expect(gate).toContain("allowlist_not_configured");

    const proxy = fs.readFileSync(path.join(SRC, "proxy.ts"), "utf8");
    expect(proxy).toContain("evaluatePreviewGate");
    // The bypass must be conditional on the gate, never unconditional.
    expect(proxy).not.toMatch(
      /if \(preview\.enabled\) \{\s*\n\s*return NextResponse\.next\(\);\s*\n\s*\}\s*\n\s*return NextResponse\.next\(\);/,
    );
  });

  it("keeps /preview behind the gate like every other protected page", () => {
    const page = fs.readFileSync(
      path.join(SRC, "app", "preview", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("getPreviewGate");
    expect(page).toContain('redirect("/sign-in")');
  });
});

describe("/preview route directory matches the repository", () => {
  const directory = JSON.parse(
    fs.readFileSync(
      path.join(SRC, "lib", "preview", "route-directory.json"),
      "utf8",
    ),
  ) as {
    pages: { route: string; file: string }[];
    api: { route: string; file: string }[];
  };

  function actualRoutes(kind: "page" | "api"): Set<string> {
    const suffix = kind === "page" ? /^page\.tsx?$/ : /^route\.ts$/;
    const found = new Set<string>();
    for (const file of walk(SRC)) {
      if (!suffix.test(path.basename(file))) continue;
      let rel = path.relative(path.join(SRC, "app"), file).replace(/\\/g, "/");
      rel = rel.replace(/\/?(page|route)\.[tj]sx?$/, "");
      rel = rel.replace(/\([^)]*\)\//g, "").replace(/\([^)]*\)/g, "");
      rel = rel.replace(/\[([^\]]+)\]/g, ":$1");
      found.add(rel === "" ? "/" : "/" + rel);
    }
    return found;
  }

  it("lists exactly the pages that exist", () => {
    const listed = new Set(directory.pages.map((p) => p.route));
    expect([...listed].sort()).toEqual([...actualRoutes("page")].sort());
  });

  it("lists exactly the API routes that exist", () => {
    const listed = new Set(directory.api.map((a) => a.route));
    expect([...listed].sort()).toEqual([...actualRoutes("api")].sort());
  });

  it("only links to files that exist on disk", () => {
    for (const entry of [...directory.pages, ...directory.api]) {
      expect(fs.existsSync(path.join(SRC, "app", entry.file))).toBe(true);
    }
  });
});
