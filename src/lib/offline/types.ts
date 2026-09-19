/**
 * Offline queue types. Shared by the queue engine, storage drivers, and tests.
 */

export const QUEUE_ACTION_TYPES = [
  "care_request.create",
  "record.stage_upload",
  "profile.update_language",
  "profile.update_contact",
  "appointment.message",
  "pharmacy.stock_update",
  "pharmacy.availability_request",
  "pharmacy.availability_response",
] as const;

export type QueueActionType = (typeof QUEUE_ACTION_TYPES)[number];

export function isQueueActionType(value: unknown): value is QueueActionType {
  return typeof value === "string" && (QUEUE_ACTION_TYPES as readonly string[]).includes(value);
}

export const QUEUE_ITEM_STATES = [
  "pending",
  "syncing",
  "synced",
  "failed",
  "requires_attention",
] as const;

export type QueueItemState = (typeof QUEUE_ITEM_STATES)[number];

export function isQueueItemState(value: unknown): value is QueueItemState {
  return typeof value === "string" && (QUEUE_ITEM_STATES as readonly string[]).includes(value);
}

/**
 * Payloads are minimized: only the fields needed to replay the action.
 * File bytes live in a separate blob entry keyed by queue item id, so the
 * JSON payload stays small and structured-clone cheap.
 */
export type QueueActionPayload =
  | {
      kind: "care_request.create";
      language: string;
      reason: string;
      contactMethod: "in_app" | "phone" | "email";
      linkedDocumentIds: string[];
      clientCreatedAt: string;
      /** Optional Part 2 structured packet (validated by PacketSchema). */
      packet?: import("@/lib/triage/packet").CareRequestPacket;
    }
  | {
      kind: "record.stage_upload";
      fileName: string;
      mimeType: string;
      byteSize: number;
      stagePurpose: "record" | "care_request_attachment";
      clientCreatedAt: string;
    }
  | { kind: "profile.update_language"; language: string }
  | { kind: "profile.update_contact"; contactMethod: string; contactValue?: string }
  | {
      kind: "appointment.message";
      appointmentId: string;
      body: string;
      clientCreatedAt: string;
    }
  | {
      kind: "pharmacy.stock_update";
      pharmacyId: string;
      medicineId: string;
      medicineLabel: string;
      status: "available" | "low_stock" | "unavailable" | "not_stocked";
      quantityHint?: number | null;
      showQuantityToPatients?: boolean;
      internalNote?: string | null;
      clientCreatedAt: string;
    }
  | {
      kind: "pharmacy.availability_request";
      pharmacyId: string;
      medicineId: string;
      medicineLabel: string;
      strength?: string | null;
      form?: string | null;
      language: string;
      clientCreatedAt: string;
    }
  | {
      kind: "pharmacy.availability_response";
      requestId: string;
      response: "confirmed_available" | "limited" | "unavailable" | "cannot_confirm_now";
      noteForPatient?: string | null;
      clientCreatedAt: string;
    };

/** A persisted queue operation. */
export interface QueueItem<T extends QueueActionPayload = QueueActionPayload> {
  /** Local primary key (UUID). */
  id: string;
  /** Server-facing idempotency key (UUID). Sent on every replay attempt. */
  idempotencyKey: string;
  actionType: QueueActionType;
  payload: T;
  /** ISO timestamp when the user performed the action locally. */
  localCreatedAt: string;
  retryCount: number;
  state: QueueItemState;
  /** Sanitized, display-safe reason for the last failure (no raw errors). */
  lastFailureReason?: string;
  /** Server record id once the server acknowledged this item. */
  serverRecordId?: string;
  /** ISO timestamp of successful server acknowledgement. */
  syncedAt?: string;
  /** ISO timestamp of the next scheduled retry attempt. */
  nextAttemptAt?: string;
  /** Blob entry key when the action carries file bytes (staged uploads). */
  blobKey?: string;
  /** ISO timestamp of the last state change (for display ordering). */
  updatedAt: string;
}

/** Result of one sync attempt for one item. */
export type SyncAttemptResult =
  | { outcome: "synced"; serverRecordId: string }
  | { outcome: "retryable_failure"; sanitizedReason: string }
  | { outcome: "requires_attention"; sanitizedReason: string };

/** Storage driver interface — real IndexedDB in production, memory in tests. */
export interface QueueStorage {
  /** Load all items (used on boot and by tests). */
  getAll(): Promise<QueueItem[]>;
  /** Insert a new item. Should reject if an item with the id exists. */
  put(item: QueueItem): Promise<void>;
  /** Update an existing item. */
  update(item: QueueItem): Promise<void>;
  /** Delete an item permanently. */
  remove(id: string): Promise<void>;
  /** Count items currently in the given state (cheap live query). */
  countByState(state: QueueItemState): Promise<number>;
}

/**
 * Blob storage for staged file bytes (IndexedDB only; memory driver supports
 * it too). Method names are deliberately distinct from QueueStorage — the two
 * were previously merged into one object and the name collision silently
 * overwrote queue-item writes with blob writes.
 */
export interface BlobStorage {
  putBlob(key: string, data: Blob): Promise<void>;
  getBlob(key: string): Promise<Blob | undefined>;
  removeBlob(key: string): Promise<void>;
}

export interface OfflineStore extends QueueStorage, BlobStorage {}
