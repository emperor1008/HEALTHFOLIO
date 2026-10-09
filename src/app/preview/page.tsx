/**
 * /preview — the navigable directory of every existing application page.
 *
 * It exists only for the temporary preview/demo setup: the route list is
 * generated from the repository itself (`node scripts/route-inventory.mjs
 * --write`), so a link here can never point at a page that does not exist.
 *
 * Access rules:
 *  - Preview mode active  → renders without a sign-in session (the proxy and
 *    the session resolver both honor the same server-side gate).
 *  - Preview mode disabled → the server-side gate fails, so this route falls
 *    back to the normal authentication rules (redirect to /sign-in), exactly
 *    like every other protected page.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPreviewGate } from "@/lib/preview/gate";
import directory from "@/lib/preview/route-directory.json";

export const metadata = {
  title: "Preview directory",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageEntry {
  route: string;
  group: string;
}

interface ApiEntry {
  route: string;
  methods: string[];
  auth: string;
}

const pages = directory.pages as PageEntry[];
const apiRoutes = directory.api as ApiEntry[];
const groups = directory.groups as { id: string; label: string }[];

export default async function PreviewDirectoryPage() {
  const gate = await getPreviewGate();
  if (!gate.enabled) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-[1100px] space-y-8 px-4 py-10">
      <header className="space-y-3">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
          Preview mode · demo data
        </span>
        <h1 className="text-3xl font-semibold text-text-primary">Preview directory</h1>
        <p className="max-w-[70ch] text-text-secondary">
          Every link below is an existing application page, generated from the
          repository&apos;s route inventory. You are signed in as the reserved
          preview identity, so pages open without a login and only touch the
          isolated demo dataset. Disable <code>HF_DEMO_MODE</code> to restore
          normal authentication — no code changes required.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Open the dashboard
          </Link>
          <Link
            href="/sign-in"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-primary"
          >
            Sign-in page
          </Link>
          <Link
            href="/"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-primary"
          >
            Home
          </Link>
        </div>
      </header>

      <section className="space-y-6">
        {groups.map((group) => {
          const groupPages = pages.filter((p) => p.group === group.id);
          if (groupPages.length === 0) return null;
          return (
            <div key={group.id} className="rounded-lg border border-border p-4">
              <h2 className="text-lg font-semibold text-text-primary">{group.label}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupPages.map((page) => (
                  <li key={page.route}>
                    <Link
                      href={page.route}
                      className="block rounded-md border border-border px-3 py-2 text-sm text-text-primary hover:bg-background"
                    >
                      {page.route}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="text-lg font-semibold text-text-primary">API endpoints</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {apiRoutes.length} route handlers. In preview mode these resolve the
          demo identity through the same session helper the application uses,
          and operate only on demo-owned rows. Unsupported methods still return
          405; validation failures still return 4xx.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-text-primary">
            Show endpoint list
          </summary>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {apiRoutes.map((route) => (
              <li key={route.route + route.methods.join(",")} className="font-mono">
                <span className="text-text-secondary">{route.methods.join(",")}</span>{" "}
                {route.route}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
