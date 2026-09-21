"use client";

/**
 * Platform-admin staff console — secure role management (release hardening).
 *
 * Honest-state rules carried over from the Part 3 staff console:
 * - Shows only REAL registry rows from `user_roles`; empty means empty.
 * - No self-service elevation: if the session is not an active platform
 *   admin, the screen says so and offers nothing else.
 * - Destructive actions (revoke) require an explicit confirmation step.
 */
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { PageTransition } from "@/components/ui/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface RoleRow {
  user_id: string;
  role: string;
  status: "active" | "suspended" | "revoked";
  scope_id: string | null;
  created_at: string;
}

interface AuditRow {
  action: string;
  target_user_id: string;
  created_at: string;
}

const ROLE_OPTIONS = [
  "platform_admin",
  "facility_coordinator",
  "clinician",
  "pharmacy_manager",
  "pharmacy_operator",
] as const;

const SCOPED = new Set(["clinician", "facility_coordinator", "pharmacy_operator", "pharmacy_manager"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function short(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export default function StaffAdminPage() {
  const { language } = useLanguage();
  const tt = useCallback((key: Parameters<typeof t3>[1]) => t3(language, key), [language]);

  const [state, setState] = useState<"loading" | "noaccess" | "ready" | "error">("loading");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("clinician");
  const [scopeId, setScopeId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/staff/admin/roles");
      if (res.status === 401 || res.status === 403) {
        setState("noaccess");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as { roles: RoleRow[]; audit: AuditRow[] };
      setRoles(data.roles ?? []);
      setAudit(data.audit ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void load().then(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const assign = useCallback(async () => {
    if (!UUID_RE.test(userId)) return;
    if (SCOPED.has(role) && !UUID_RE.test(scopeId)) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/staff/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          role,
          ...(SCOPED.has(role) ? { scope_id: scopeId } : {}),
        }),
      });
      if (res.ok) {
        setUserId("");
        setScopeId("");
        setNotice(tt("adminSaved"));
        await load();
      } else {
        setNotice(null);
        setState("error");
      }
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }, [userId, role, scopeId, tt, load]);

  const changeStatus = useCallback(
    async (target: RoleRow, action: "suspend" | "reinstate" | "revoke") => {
      if (action === "revoke" && !window.confirm(tt("adminConfirmRevoke"))) return;
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/staff/admin/roles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: target.user_id, role: target.role, action }),
        });
        if (res.ok) {
          setNotice(tt("adminSaved"));
          await load();
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      } finally {
        setBusy(false);
      }
    },
    [tt, load]
  );

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <h1 className="text-2xl font-semibold text-text-primary">{tt("adminConsoleTitle")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{tt("adminConsoleSubtitle")}</p>

        {state === "loading" && <p className="mt-4 text-sm text-text-secondary">…</p>}

        {state === "error" && (
          <Card padding="md" className="mt-4">
            <p className="text-sm text-text-primary">{tt("errorGeneric")}</p>
          </Card>
        )}

        {state === "noaccess" && (
          <Card padding="md" className="mt-4">
            <p className="font-medium text-text-primary">{tt("adminNoAccess")}</p>
            <p className="mt-1 text-sm text-text-secondary">{tt("adminNoAccessHint")}</p>
          </Card>
        )}

        {state === "ready" && (
          <>
            <Card padding="md" className="mt-4">
              <p className="font-medium text-text-primary">{tt("adminAssignHeading")}</p>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="text-text-secondary">{tt("adminAssignUserId")}</span>
                  <input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-text-primary"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-text-secondary">{tt("adminAssignRole")}</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as (typeof ROLE_OPTIONS)[number])}
                    className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-text-primary"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                {SCOPED.has(role) && (
                  <label className="block text-sm">
                    <span className="text-text-secondary">{tt("adminAssignScope")}</span>
                    <input
                      value={scopeId}
                      onChange={(e) => setScopeId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-text-primary"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      autoComplete="off"
                    />
                    <span className="mt-1 block text-xs text-text-secondary">{tt("adminAssignScopeHint")}</span>
                  </label>
                )}
                <Button
                  variant="primary"
                  disabled={busy || !UUID_RE.test(userId) || (SCOPED.has(role) && !UUID_RE.test(scopeId))}
                  onClick={() => void assign()}
                >
                  {tt("adminAssignSubmit")}
                </Button>
                {notice && <p className="text-sm text-state-positive">{notice}</p>}
              </div>
            </Card>

            <Card padding="md" className="mt-4">
              <p className="font-medium text-text-primary">{tt("adminRolesHeading")}</p>
              {roles.length === 0 ? (
                <p className="mt-2 text-sm text-text-secondary">{tt("adminEmpty")}</p>
              ) : (
                <ul className="mt-2 divide-y divide-border-subtle">
                  {roles.map((r) => (
                    <li key={`${r.user_id}-${r.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-text-primary">{short(r.user_id)}</p>
                        <p className="text-xs text-text-secondary">
                          {r.role} · {tt("adminRoleStatus")}: {r.status}
                          {r.scope_id ? ` · ${short(r.scope_id)}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {r.status !== "active" && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void changeStatus(r, "reinstate")}>
                            {tt("adminActionReinstate")}
                          </Button>
                        )}
                        {r.status === "active" && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void changeStatus(r, "suspend")}>
                            {tt("adminActionSuspend")}
                          </Button>
                        )}
                        {r.status !== "revoked" && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void changeStatus(r, "revoke")}>
                            {tt("adminActionRevoke")}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card padding="md" className="mt-4">
              <p className="font-medium text-text-primary">{tt("adminAuditHeading")}</p>
              {audit.length === 0 ? (
                <p className="mt-2 text-sm text-text-secondary">{tt("adminAuditEmpty")}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {audit.slice(0, 20).map((a, i) => (
                    <li key={i} className="text-xs text-text-secondary">
                      {a.action} · {short(a.target_user_id)} · {new Date(a.created_at).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </PageTransition>
  );
}
