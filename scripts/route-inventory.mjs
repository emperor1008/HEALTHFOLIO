/**
 * Route inventory (Phase 0 audit helper) + preview directory source.
 *
 * Walks src/app and prints every page and API route with its HTTP method
 * handlers and the auth seam each API route uses. With `--write` it also
 * regenerates src/lib/preview/route-directory.json, which is what the
 * /preview directory renders — so the directory can only ever list routes
 * that actually exist in the repository.
 *
 * Run:  node scripts/route-inventory.mjs [--json] [--write]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");
const DIRECTORY_OUT = path.join(
  ROOT,
  "src",
  "lib",
  "preview",
  "route-directory.json",
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function toRoute(file) {
  const rel = path.relative(APP, file).replace(/\\/g, "/");
  const base = path.basename(rel);
  const kind = /^page\.(tsx|ts|jsx|js)$/.test(base)
    ? "page"
    : /^route\.(ts|tsx)$/.test(base)
      ? "api"
      : null;
  if (!kind) return null;
  let route = rel.replace(/\/?(page|route)\.[tj]sx?$/, "");
  route = route.replace(/\([^)]*\)\//g, "").replace(/\([^)]*\)/g, "");
  const params = [];
  route = route.replace(/\[([^\]]+)\]/g, (_, name) => {
    params.push(name);
    return ":" + name;
  });
  if (route === "") route = "/";
  else route = "/" + route;
  return { route, kind, file: rel, params };
}

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const AUTH_PATTERNS = [
  ["requireSession", /requireSession\(/],
  ["requireRole", /requireRole\(/],
  ["getUser", /\bgetUser\(\)/],
  ["getSessionUser", /getSessionUser\(\)/],
  ["supabase.auth.getUser", /supabase\.auth\.getUser/],
  ["none-detected", null],
];

/**
 * Preview-directory groups, in display order. Each rule is matched against
 * the route path in order; the first match wins. Routes are only ever placed
 * here if the file walk found them.
 */
const GROUPS = [
  {
    id: "dashboard",
    label: "Main dashboard",
    match: ["/", "/dashboard"],
  },
  {
    id: "records",
    label: "Health profile and records",
    match: [
      "/health-card",
      "/health-tracking",
      "/records",
      "/medicines",
      "/metrics",
    ],
  },
  {
    id: "documents",
    label: "Document upload and extraction",
    match: ["/documents", "/prepare", "/preparation", "/review", "/runs"],
  },
  {
    id: "timeline",
    label: "Medical timeline",
    match: ["/timeline"],
  },
  {
    id: "reminders",
    label: "Reminders and reports",
    match: ["/routine", "/reports", "/calendar", "/briefs"],
  },
  {
    id: "assistant",
    label: "Voice assistant and symptom guidance",
    match: ["/symptoms", "/ask"],
  },
  {
    id: "consultations",
    label: "Video consultations",
    match: ["/consultations", "/care-requests", "/consent", "/appointments"],
  },
  {
    id: "pharmacy",
    label: "Pharmacy information",
    match: ["/pharmacy", "/availability", "/facilities"],
  },
  {
    id: "settings",
    label: "Settings and account management",
    match: ["/settings", "/account"],
  },
  {
    id: "pwa",
    label: "PWA and offline experience",
    match: ["/offline", "/reliability"],
  },
  {
    id: "clinician",
    label: "Clinician console",
    match: ["/doctor"],
  },
  {
    id: "admin",
    label: "Administration and staff",
    match: ["/admin", "/staff"],
  },
  {
    id: "auth",
    label: "Authentication and access",
    match: [
      "/sign-in",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/access-denied",
    ],
  },
];

/** `/doctor/apply` is an application form, not the clinician console. */
const FORCE_GROUP = {
  "/doctor/apply": "auth",
};

function groupOf(route) {
  if (FORCE_GROUP[route]) return FORCE_GROUP[route];
  if (route === "/") return "dashboard";
  for (const group of GROUPS) {
    for (const prefix of group.match) {
      if (route === prefix || route.startsWith(prefix + "/")) return group.id;
    }
  }
  return "other";
}

const routes = walk(APP)
  .map(toRoute)
  .filter(Boolean)
  .sort((a, b) => a.route.localeCompare(b.route));

const inventory = routes.map((r) => {
  const src = fs.readFileSync(path.join(APP, r.file), "utf8");
  const methods =
    r.kind === "api"
      ? HTTP_METHODS.filter((m) =>
          new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src),
        )
      : [];
  const seam =
    r.kind === "api"
      ? (AUTH_PATTERNS.find(([, re]) => re === null || re.test(src)) || [
          "none-detected",
          null,
        ])[0]
      : "page";
  return { ...r, methods, seam };
});

const pages = inventory.filter((r) => r.kind === "page");
const apis = inventory.filter((r) => r.kind === "api");

if (process.argv.includes("--write")) {
  const directory = {
    generatedAt: new Date().toISOString(),
    source: "scripts/route-inventory.mjs",
    groups: [
      ...GROUPS.map((g) => ({ id: g.id, label: g.label })),
      { id: "other", label: "Other pages" },
    ],
    pages: pages.map((p) => ({
      route: p.route,
      group: groupOf(p.route),
      file: p.file,
    })),
    api: apis.map((a) => ({
      route: a.route,
      methods: a.methods,
      auth: a.seam,
      file: a.file,
    })),
  };
  fs.mkdirSync(path.dirname(DIRECTORY_OUT), { recursive: true });
  fs.writeFileSync(DIRECTORY_OUT, JSON.stringify(directory, null, 2) + "\n");
  console.log(
    `wrote ${path.relative(ROOT, DIRECTORY_OUT)} (${pages.length} pages, ${apis.length} api routes)`,
  );
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(inventory, null, 2));
} else {
  console.log(
    `TOTAL ROUTES: ${inventory.length}  (pages ${pages.length}, api ${apis.length})`,
  );
  console.log("\n--- PAGES ---");
  for (const p of pages)
    console.log(`${p.route.padEnd(40)} ${groupOf(p.route)}`);
  console.log("\n--- API ---");
  for (const a of apis)
    console.log(
      `${a.route.padEnd(46)} ${a.methods.join(",").padEnd(22)} ${a.seam}`,
    );
}
