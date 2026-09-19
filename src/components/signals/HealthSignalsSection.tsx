"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { describeSignal } from "@/lib/signals/wording";
import {
  fetchOpenSignals,
  applySignalAction,
  type SignalRow,
} from "@/lib/signals/client";

const GENERIC_ERROR = "Health signals are temporarily unavailable. Try again.";

interface HealthSignalsSectionProps {
  /** Optional document-name resolver for the evidence link. */
  onOpenEvidence?: (documentId: string, pageNumber: number) => void;
  limit?: number;
  title?: string;
}

export function HealthSignalsSection({
  onOpenEvidence,
  limit = 3,
  title = "Health Signals",
}: HealthSignalsSectionProps) {
  const [signals, setSignals] = useState<SignalRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    setLoadFailed(false);
    setActionFailed(false);
    try {
      const rows = await fetchOpenSignals(limit);
      setSignals(rows);
    } catch {
      setSignals([]);
      setLoadFailed(true);
    }
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(signal: SignalRow, action: "acknowledge" | "dismiss" | "save_for_later") {
    if (pendingId) return; // duplicate-click guard
    setPendingId(signal.id);
    try {
      await applySignalAction(signal.id, action);
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(signal.id);
        return next;
      });
    } catch {
      setActionFailed(true);
    } finally {
      setPendingId(null);
    }
  }

  if (loadFailed) {
    return (
      <section aria-label={title}>
        <h2 className="text-lg font-semibold text-forest-900 mb-3">{title}</h2>
        <Card>
          <div className="py-6 text-center">
            <p className="text-sm text-text-secondary">{GENERIC_ERROR}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
              Try again
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label={title}>
      <h2 className="text-lg font-semibold text-forest-900 mb-3">{title}</h2>

      {actionFailed && (
        <p role="status" className="mb-3 rounded-card border border-border bg-surface px-4 py-2 text-sm text-text-secondary">
          We could not update this signal. Your health records were not changed.
        </p>
      )}

      {!signals ? (
        <div className="space-y-3" aria-hidden="true">
          <SignalCardSkeleton />
          <SignalCardSkeleton />
        </div>
      ) : visibleSignals(signals, hiddenIds).length === 0 ? (
        <Card>
          <div className="py-5 text-center">
            <p className="text-sm text-text-secondary">
              Verified measurements will appear here after you add and review health records.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {visibleSignals(signals, hiddenIds).map((signal) => (
              <motion.li
                key={signal.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <SignalCard
                  signal={signal}
                  busy={pendingId === signal.id}
                  onAcknowledge={() => act(signal, "acknowledge")}
                  onSaveForLater={() => act(signal, "save_for_later")}
                  onDismiss={() => act(signal, "dismiss")}
                  onOpenEvidence={onOpenEvidence}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function visibleSignals(signals: SignalRow[], hidden: Set<string>): SignalRow[] {
  return signals.filter((s) => !hidden.has(s.id));
}

function SignalCard({
  signal,
  busy,
  onAcknowledge,
  onSaveForLater,
  onDismiss,
  onOpenEvidence,
}: {
  signal: SignalRow;
  busy: boolean;
  onAcknowledge: () => void;
  onSaveForLater: () => void;
  onDismiss: () => void;
  onOpenEvidence?: (documentId: string, pageNumber: number) => void;
}) {
  const copy = describeSignal(
    signal.signal_type as never,
    signal.display_name,
    signal.payload
  );
  const latestEvidence = signal.evidence?.latest;

  return (
    <Card className="transition-shadow duration-200 hover:shadow-sm">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-forest-900">{copy.headline}</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {signal.display_name} · Updated {formatRelative(signal.updated_at)}
            </p>
          </div>
          <Badge variant="info">New</Badge>
        </div>

        <ul className="space-y-1 text-sm text-text-secondary">
          {copy.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2 pt-1">
          {latestEvidence && onOpenEvidence && (
            <Button variant="secondary" size="sm" onClick={() => onOpenEvidence(latestEvidence.documentId, latestEvidence.pageNumber)}>
              View evidence
            </Button>
          )}
          <Button size="sm" onClick={onAcknowledge} disabled={busy}>
            Acknowledge
          </Button>
          <Button variant="secondary" size="sm" onClick={onSaveForLater} disabled={busy}>
            Save for later
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
            Dismiss
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function SignalCardSkeleton() {
  return (
    <Card>
      <div className="space-y-3 animate-pulse" aria-hidden="true">
        <div className="h-4 w-2/3 rounded bg-border/60" />
        <div className="h-3 w-1/3 rounded bg-border/40" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-border/40" />
          <div className="h-3 w-5/6 rounded bg-border/40" />
        </div>
        <div className="flex gap-2 pt-1">
          <div className="h-8 w-28 rounded-full bg-border/50" />
          <div className="h-8 w-24 rounded-full bg-border/50" />
          <div className="h-8 w-20 rounded-full bg-border/50" />
        </div>
      </div>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
