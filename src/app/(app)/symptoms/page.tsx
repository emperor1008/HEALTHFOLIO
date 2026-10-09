"use client";

/**
 * Guided symptom checker (Phase 2).
 *
 * Offline-capable: the whole flow (buttons, duration/severity, deterministic
 * triage) runs locally; only the optional language-understanding step calls
 * the server, and its failure degrades visibly to the guided path.
 */
import { PageTransition } from "@/components/ui/PageTransition";
import { SymptomChecker } from "@/components/care/SymptomChecker";

export default function SymptomsPage() {
  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <SymptomChecker />
      </main>
    </PageTransition>
  );
}
