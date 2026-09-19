"use client";

/**
 * React binding for the offline sync engine. Creates the engine once per
 * browser session, wires lifecycle triggers, and exposes a small public API
 * for enqueueing actions and reading queue state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createNetworkMonitor } from "./network";
import { getOfflineStore } from "./storage";
import { createSyncEngine, FAILURE_REASONS, type SyncEngine } from "./sync-engine";
import type { OfflineStore, QueueActionPayload, QueueItem, SyncAttemptResult } from "./types";

export interface SyncContextValue {
  online: boolean;
  items: QueueItem[];
  syncing: boolean;
  /** True once persisted queue items have been loaded from IndexedDB. */
  ready: boolean;
  /** Counts derived from items for SyncStatus. */
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  syncNow: () => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  /** Queue a care request draft (works offline). */
  enqueueCareRequest: (input: {
    language: string;
    reason: string;
    contactMethod: "in_app" | "phone" | "email";
    linkedDocumentIds: string[];
    /** Optional Part 2 structured packet. */
    packet?: import("@/lib/triage/packet").CareRequestPacket;
  }) => Promise<QueueItem>;
  /** Stage an offline/failed upload (works offline). Returns the queue item. */
  stageUpload: (input: {
    file: File;
    stagePurpose: "record" | "care_request_attachment";
  }) => Promise<QueueItem>;
  /** Queue a Part 2 care-request packet (works offline; exact packet preserved). */
  enqueueCareRequestPacket: (input: {
    language: "en" | "hi" | "or";
    packet: import("@/lib/triage/packet").CareRequestPacket;
  }) => Promise<QueueItem>;
  /** Queue a language-preference update (used when the direct PATCH fails). */
  enqueueLanguagePreference: (language: string) => Promise<QueueItem>;
  /** Queue a secure consultation message for offline sending. */
  enqueueAppointmentMessage: (input: { appointmentId: string; body: string }) => Promise<QueueItem>;
  /** Queue a pharmacy stock update (staff; works offline). */
  enqueuePharmacyStockUpdate: (input: {
    pharmacyId: string;
    medicineId: string;
    medicineLabel: string;
    status: "available" | "low_stock" | "unavailable" | "not_stocked";
    quantityHint?: number | null;
    showQuantityToPatients?: boolean;
    internalNote?: string | null;
  }) => Promise<QueueItem>;
  /** Queue a non-binding patient availability request (works offline). */
  enqueuePharmacyAvailabilityRequest: (input: {
    pharmacyId: string;
    medicineId: string;
    medicineLabel: string;
    strength?: string | null;
    form?: string | null;
    language: string;
  }) => Promise<QueueItem>;
  /** Queue a pharmacy operator response to an availability request (offline-safe). */
  enqueuePharmacyAvailabilityResponse: (input: {
    requestId: string;
    response: "confirmed_available" | "limited" | "unavailable" | "cannot_confirm_now";
    noteForPatient?: string | null;
  }) => Promise<QueueItem>;
}

/**
 * Bridge so the language context can queue a preference update when its
 * direct PATCH fails (offline/server down) without needing provider nesting.
 */
let languageEnqueueRef: ((language: string) => Promise<QueueItem>) | null = null;

export function tryEnqueueLanguagePreference(language: string): boolean {
  const fn = languageEnqueueRef;
  if (!fn) return false;
  void fn(language).catch(() => {
    /* queue storage failure: local preference still applies for the session */
  });
  return true;
}

const SyncContext = createContext<SyncContextValue | null>(null);

function createHttpHandlers(): {
  execute: (
    item: QueueItem,
    ctx: { getBlob: (key: string) => Promise<Blob | undefined> }
  ) => Promise<SyncAttemptResult>;
} {
  return {
    async execute(item, ctx): Promise<SyncAttemptResult> {
      // Per-action dispatch. Every branch returns a SyncAttemptResult —
      // transport failures become retryable_failure, never a lost item.
      switch (item.actionType) {
        case "care_request.create": {
          const p = item.payload as Extract<QueueActionPayload, { kind: "care_request.create" }>;
          const res = await fetch("/api/care-requests", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({
              language: p.language,
              reason: p.reason,
              contact_method: p.contactMethod,
              linked_document_ids: p.linkedDocumentIds,
              client_created_at: p.clientCreatedAt,
              ...(p.packet ? { packet: p.packet } : {}),
            }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as
              | { careRequest?: { id?: string } }
              | null;
            return { outcome: "synced", serverRecordId: data?.careRequest?.id ?? "care_request" };
          }
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "record.stage_upload": {
          const p = item.payload as Extract<QueueActionPayload, { kind: "record.stage_upload" }>;
          const blob = item.blobKey ? await ctx.getBlob(item.blobKey) : undefined;
          if (!blob) {
            return {
              outcome: "requires_attention",
              sanitizedReason: "The saved file could not be found on this device",
            };
          }
          const form = new FormData();
          form.append("file", blob, p.fileName);
          form.append("purpose", p.stagePurpose);
          const res = await fetch("/api/upload-sessions", {
            method: "POST",
            headers: { "Idempotency-Key": item.idempotencyKey },
            body: form,
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as
              | { uploadSession?: { id?: string } }
              | null;
            return { outcome: "synced", serverRecordId: data?.uploadSession?.id ?? "upload_session" };
          }
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "appointment.message": {
          const p = item.payload as Extract<QueueActionPayload, { kind: "appointment.message" }>;
          const res = await fetch(`/api/appointments/${p.appointmentId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({
              body: p.body,
              client_created_at: p.clientCreatedAt,
            }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) {
            return { outcome: "synced", serverRecordId: "message" };
          }
          if (res.status === 429) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "pharmacy.stock_update": {
          const p = item.payload as Extract<QueueActionPayload, { kind: "pharmacy.stock_update" }>;
          const res = await fetch("/api/pharmacy/stock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({
              pharmacyId: p.pharmacyId,
              medicineId: p.medicineId,
              medicineLabel: p.medicineLabel,
              status: p.status,
              quantityHint: p.quantityHint ?? null,
              showQuantityToPatients: p.showQuantityToPatients ?? false,
              internalNote: p.internalNote ?? null,
              source: "manual_operator",
              idempotencyKey: item.idempotencyKey,
            }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as { eventId?: string } | null;
            return { outcome: "synced", serverRecordId: data?.eventId ?? "stock_event" };
          }
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "pharmacy.availability_request": {
          const p = item.payload as Extract<
            QueueActionPayload,
            { kind: "pharmacy.availability_request" }
          >;
          const res = await fetch("/api/pharmacy/requests", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({
              pharmacyId: p.pharmacyId,
              medicineId: p.medicineId,
              medicineLabel: p.medicineLabel,
              strength: p.strength ?? null,
              form: p.form ?? null,
              language: p.language,
              idempotencyKey: item.idempotencyKey,
            }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as { requestId?: string } | null;
            return { outcome: "synced", serverRecordId: data?.requestId ?? "availability_request" };
          }
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "pharmacy.availability_response": {
          const p = item.payload as Extract<
            QueueActionPayload,
            { kind: "pharmacy.availability_response" }
          >;
          const res = await fetch("/api/pharmacy/requests/respond", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({
              requestId: p.requestId,
              response: p.response,
              noteForPatient: p.noteForPatient ?? null,
              idempotencyKey: item.idempotencyKey,
            }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as { responseId?: string } | null;
            return { outcome: "synced", serverRecordId: data?.responseId ?? "availability_response" };
          }
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "profile.update_language": {
          const p = item.payload as Extract<QueueActionPayload, { kind: "profile.update_language" }>;
          const res = await fetch("/api/profile", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({ preferred_language: p.language }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) return { outcome: "synced", serverRecordId: "profile" };
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        case "profile.update_contact": {
          const p = item.payload as Extract<QueueActionPayload, { kind: "profile.update_contact" }>;
          const res = await fetch("/api/profile", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": item.idempotencyKey,
            },
            body: JSON.stringify({
              preferred_contact_method: p.contactMethod,
              contact_value: p.contactValue,
            }),
          });
          if (res.status === 401 || res.status === 403) {
            return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.auth_expired };
          }
          if (res.ok) return { outcome: "synced", serverRecordId: "profile" };
          if (res.status >= 500) {
            return { outcome: "retryable_failure", sanitizedReason: FAILURE_REASONS.server_busy };
          }
          return { outcome: "requires_attention", sanitizedReason: FAILURE_REASONS.rejected };
        }

        default: {
          // Unknown/unsupported action types must never be silently dropped.
          return {
            outcome: "requires_attention",
            sanitizedReason: "This saved item is no longer supported by this app version",
          };
        }
      }
    },
  };
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<SyncEngine | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    const store: OfflineStore = getOfflineStore();
    const network = createNetworkMonitor(window);
    const handlers = createHttpHandlers();
    const engine = createSyncEngine({
      store,
      network,
      handlers,
      events: {
        onSyncStart: () => setSyncing(true),
        onSyncEnd: () => setSyncing(false),
      },
    });
    engineRef.current = engine;
    languageEnqueueRef = (language: string) =>
      engine.enqueue("profile.update_language", { kind: "profile.update_language", language });

    setOnline(network.getState().online);
    const unsubNetwork = network.subscribe((state) => setOnline(state.online));

    // Live queue changes (enqueue, state transitions) must reach React state.
    const unsubQueue = engine.subscribe((next) => {
      if (!disposed) setItems(next);
    });

    // Load persisted items (survives refresh/restart).
    void store.getAll().then((persisted) => {
      if (!disposed) {
        setItems(persisted);
        setReady(true);
      }
    });

    return () => {
      disposed = true;
      languageEnqueueRef = null;
      unsubNetwork();
      unsubQueue();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const syncNow = useCallback(async () => {
    await engineRef.current?.syncNow("manual");
  }, []);

  const retryItem = useCallback(async (id: string) => {
    await engineRef.current?.retryItem(id);
  }, []);

  const removeItem = useCallback(async (id: string) => {
    await engineRef.current?.removeItem(id);
  }, []);

  const enqueueCareRequest = useCallback<SyncContextValue["enqueueCareRequest"]>(async (input) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Sync engine not ready");
    return engine.enqueue("care_request.create", {
      kind: "care_request.create",
      language: input.language,
      reason: input.reason,
      contactMethod: input.contactMethod,
      linkedDocumentIds: input.linkedDocumentIds,
      clientCreatedAt: new Date().toISOString(),
      packet: input.packet,
    });
  }, []);

  const enqueueCareRequestPacket = useCallback<SyncContextValue["enqueueCareRequestPacket"]>(
    async (input) => {
      const engine = engineRef.current;
      if (!engine) throw new Error("Sync engine not ready");
      return engine.enqueue("care_request.create", {
        kind: "care_request.create",
        language: input.language,
        reason: input.packet.summary,
        contactMethod: "in_app",
        linkedDocumentIds: input.packet.linked_document_ids,
        clientCreatedAt: input.packet.created_at,
        packet: input.packet,
      });
    },
    []
  );

  const stageUpload = useCallback<SyncContextValue["stageUpload"]>(async (input) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Sync engine not ready");
    return engine.enqueue(
      "record.stage_upload",
      {
        kind: "record.stage_upload",
        fileName: input.file.name,
        mimeType: input.file.type,
        byteSize: input.file.size,
        stagePurpose: input.stagePurpose,
        clientCreatedAt: new Date().toISOString(),
      },
      { blob: input.file }
    );
  }, []);

  const enqueueLanguagePreference = useCallback<SyncContextValue["enqueueLanguagePreference"]>(
    async (language) => {
      const engine = engineRef.current;
      if (!engine) throw new Error("Sync engine not ready");
      return engine.enqueue("profile.update_language", {
        kind: "profile.update_language",
        language,
      });
    },
    []
  );

  const enqueueAppointmentMessage = useCallback<SyncContextValue["enqueueAppointmentMessage"]>(
    async (input) => {
      const engine = engineRef.current;
      if (!engine) throw new Error("Sync engine not ready");
      return engine.enqueue("appointment.message", {
        kind: "appointment.message",
        appointmentId: input.appointmentId,
        body: input.body,
        clientCreatedAt: new Date().toISOString(),
      });
    },
    []
  );

  const enqueuePharmacyStockUpdate = useCallback<SyncContextValue["enqueuePharmacyStockUpdate"]>(
    async (input) => {
      const engine = engineRef.current;
      if (!engine) throw new Error("Sync engine not ready");
      return engine.enqueue("pharmacy.stock_update", {
        kind: "pharmacy.stock_update",
        ...input,
        clientCreatedAt: new Date().toISOString(),
      });
    },
    []
  );

  const enqueuePharmacyAvailabilityRequest = useCallback<
    SyncContextValue["enqueuePharmacyAvailabilityRequest"]
  >(async (input) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Sync engine not ready");
    return engine.enqueue("pharmacy.availability_request", {
      kind: "pharmacy.availability_request",
      ...input,
      clientCreatedAt: new Date().toISOString(),
    });
  }, []);

  const enqueuePharmacyAvailabilityResponse = useCallback<
    SyncContextValue["enqueuePharmacyAvailabilityResponse"]
  >(async (input) => {
    const engine = engineRef.current;
    if (!engine) throw new Error("Sync engine not ready");
    return engine.enqueue("pharmacy.availability_response", {
      kind: "pharmacy.availability_response",
      ...input,
      clientCreatedAt: new Date().toISOString(),
    });
  }, []);

  const pendingCount = items.filter((i) => i.state === "pending" || i.state === "syncing").length;
  const failedCount = items.filter(
    (i) => i.state === "failed" || i.state === "requires_attention"
  ).length;
  const syncedCount = items.filter((i) => i.state === "synced").length;

  const value = useMemo<SyncContextValue>(
    () => ({
      online,
      items,
      syncing,
      ready,
      pendingCount,
      failedCount,
      syncedCount,
      syncNow,
      retryItem,
      removeItem,
      enqueueCareRequest,
      enqueueCareRequestPacket,
      stageUpload,
      enqueueLanguagePreference,
      enqueueAppointmentMessage,
      enqueuePharmacyStockUpdate,
      enqueuePharmacyAvailabilityRequest,
      enqueuePharmacyAvailabilityResponse,
    }),
    [
      online,
      items,
      syncing,
      ready,
      pendingCount,
      failedCount,
      syncedCount,
      syncNow,
      retryItem,
      removeItem,
      enqueueCareRequest,
      enqueueCareRequestPacket,
      stageUpload,
      enqueueLanguagePreference,
      enqueueAppointmentMessage,
      enqueuePharmacyStockUpdate,
      enqueuePharmacyAvailabilityRequest,
      enqueuePharmacyAvailabilityResponse,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
