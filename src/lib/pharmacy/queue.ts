/**
 * Registers pharmacy actions in the offline queue (Part 4).
 * Returns the sync handler map used by the sync engine.
 */

import type { QueueActionPayload } from "@/lib/offline/types";
import type { StockUpdateInput, AvailabilityRequestInput, AvailabilityResponseInput } from "./schemas";

export type PharmacyQueueAction =
  | { type: "pharmacy.stock_update"; payload: StockUpdateInput }
  | { type: "pharmacy.availability_request"; payload: AvailabilityRequestInput }
  | { type: "pharmacy.availability_response"; payload: AvailabilityResponseInput };

export const PHARMACY_QUEUE_ACTIONS: ReadonlySet<string> = new Set([
  "pharmacy.stock_update",
  "pharmacy.availability_request",
  "pharmacy.availability_response",
]);

export function isPharmacyQueueAction(type: string): boolean {
  return PHARMACY_QUEUE_ACTIONS.has(type);
}

export interface QueueResult {
  ok: boolean;
  duplicate?: boolean;
  id?: string;
}

/**
 * Pure executor — receives a typed action and the fetch-based transport the
 * engine already uses. Kept separate from React/provider code so it can be
 * unit-tested offline.
 */
export async function executePharmacyAction(
  action: PharmacyQueueAction,
  transport: (path: string, body: unknown) => Promise<{ ok: boolean; id?: string; duplicate?: boolean }>,
): Promise<QueueResult> {
  switch (action.type) {
    case "pharmacy.stock_update": {
      const r = await transport("/api/pharmacy/stock", action.payload);
      return { ok: r.ok, duplicate: r.duplicate, id: r.id };
    }
    case "pharmacy.availability_request": {
      const r = await transport("/api/pharmacy/requests", action.payload);
      return { ok: r.ok, duplicate: r.duplicate, id: r.id };
    }
    case "pharmacy.availability_response": {
      const r = await transport("/api/pharmacy/requests/respond", action.payload);
      return { ok: r.ok, duplicate: r.duplicate, id: r.id };
    }
  }
}
