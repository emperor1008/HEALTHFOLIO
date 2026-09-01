/**
 * Feature 6: Medication Routine Agent — Notification Service
 *
 * In-app and browser notification support for medication reminders.
 * Web Push is stubbed and documented as requiring configuration.
 */

import type { MedicationOccurrence } from "./types";

// ─── Notification Permission States ───────────────────────────────────────

export type NotificationPermissionState =
  | "default"
  | "granted"
  | "denied"
  | "unsupported"
  | "insecure_context";

/**
 * Check browser notification permission status.
 */
export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
    return "insecure_context";
  }
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

/**
 * Request notification permission after explicit user action.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = getNotificationPermissionState();
  if (current === "unsupported" || current === "denied" || current === "insecure_context") {
    return current;
  }
  const result = await Notification.requestPermission();
  return result as NotificationPermissionState;
}

// ─── In-App Reminder Store ────────────────────────────────────────────────

export interface InAppReminder {
  occurrenceId: string;
  planId: string;
  medicineName: string;
  scheduledTime: string;
  sourceInstruction: string;
  dueWindowStart: string;
  dueWindowEnd: string;
  status: string;
  showDetails: boolean;
}

type ReminderListener = (reminders: InAppReminder[]) => void;

let activeReminders: InAppReminder[] = [];
let listeners: ReminderListener[] = [];

/**
 * Subscribe to in-app reminder changes.
 */
export function onRemindersChange(listener: ReminderListener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function notifyListeners() {
  for (const listener of listeners) {
    listener([...activeReminders]);
  }
}

/**
 * Add due occurrences to the in-app reminder store.
 */
export function addDueReminders(
  occurrences: MedicationOccurrence[],
  planId: string,
  medicineName: string,
  sourceInstruction: string,
  showDetails: boolean = false
): void {
  for (const occ of occurrences) {
    const exists = activeReminders.some((r) => r.occurrenceId === occ.id);
    if (!exists) {
      activeReminders.push({
        occurrenceId: occ.id,
        planId,
        medicineName: showDetails ? medicineName : "Scheduled medication",
        scheduledTime: occ.localScheduledTime,
        sourceInstruction: showDetails ? sourceInstruction : "",
        dueWindowStart: occ.dueWindowStart,
        dueWindowEnd: occ.dueWindowEnd,
        status: occ.status,
        showDetails,
      });
    }
  }
  notifyListeners();
}

/**
 * Remove an occurrence from the in-app reminder store.
 */
export function dismissReminder(occurrenceId: string): void {
  activeReminders = activeReminders.filter((r) => r.occurrenceId !== occurrenceId);
  notifyListeners();
}

/**
 * Get current in-app reminders.
 */
export function getActiveReminders(): InAppReminder[] {
  return [...activeReminders];
}

// ─── Browser Notification ────────────────────────────────────────────────

const NOTIFICATION_TAG_PREFIX = "healthfolio-routine-";

/**
 * Send a browser notification if permitted.
 * Lock-screen privacy: does not show medicine details by default.
 */
export function sendBrowserNotification(
  occurrenceId: string,
  title: string,
  body: string,
  showMedicineDetails: boolean = false
): void {
  const permission = getNotificationPermissionState();
  if (permission !== "granted") return;

  const tag = `${NOTIFICATION_TAG_PREFIX}${occurrenceId}`;

  try {
    new Notification(title, {
      body,
      tag,
      requireInteraction: true,
      silent: false,
    });
  } catch {
    // Notification constructor may throw in some environments
  }
}

/**
 * Send a private notification that hides medicine details on lock screen.
 */
export function sendPrivateMedicationReminder(
  occurrenceId: string,
  scheduledTime: string,
  showMedicineDetails: boolean = false,
  medicineName?: string
): void {
  const title = "Healthfolio reminder";
  const body = showMedicineDetails && medicineName
    ? `${medicineName} — scheduled for ${scheduledTime}`
    : "You have a scheduled health reminder.";

  sendBrowserNotification(occurrenceId, title, body, showMedicineDetails);
}

// ─── Snooze Options ──────────────────────────────────────────────────────

export const SNOOZE_OPTIONS_MINUTES = [5, 10, 15, 30, 60] as const;

// ─── Privacy Settings ────────────────────────────────────────────────────

export interface NotificationPrivacySettings {
  showMedicineDetails: boolean;
}

const DEFAULT_PRIVACY_SETTINGS: NotificationPrivacySettings = {
  showMedicineDetails: false,
};

let currentPrivacySettings: NotificationPrivacySettings = { ...DEFAULT_PRIVACY_SETTINGS };

/**
 * Get current notification privacy settings.
 */
export function getNotificationPrivacySettings(): NotificationPrivacySettings {
  return { ...currentPrivacySettings };
}

/**
 * Update notification privacy settings.
 */
export function updateNotificationPrivacySettings(
  settings: Partial<NotificationPrivacySettings>
): void {
  currentPrivacySettings = { ...currentPrivacySettings, ...settings };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

/**
 * Clear all in-app reminders (for testing or component unmount).
 */
export function clearAllReminders(): void {
  activeReminders = [];
  notifyListeners();
}
