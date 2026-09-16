"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeletons";
import { PageTransition, CardHover } from "@/components/ui/PageTransition";
import { SAFETY_DISCLAIMERS } from "@/lib/medicines/safety";

interface MedicineSearchResult {
  rxcui: string;
  name: string;
  entityType: string;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  doseForm: string | null;
  route: string | null;
  source: string;
}

interface PrescribedMedicine {
  link: {
    id: string;
    relationship_type: string;
    verification_status: string;
    created_at: string;
    document_id?: string | null;
  };
  entity: {
    id: string;
    displayName: string;
    genericName: string | null;
    strength: string | null;
  } | null;
  prescriptionText: string | null;
}

export default function MedicinesPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<MedicineSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [prescribed, setPrescribed] = useState<PrescribedMedicine[]>([]);
  const [loadingPrescribed, setLoadingPrescribed] = useState(true);
  const [prescribedFailed, setPrescribedFailed] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [emergencyMessage, setEmergencyMessage] = useState("");

  // Load prescribed medicines
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setPrescribedFailed(true);
          setLoadingPrescribed(false);
          return;
        }

        const response = await fetch("/api/medicines/link");
        const json = await response.json();
        if (json.data?.medicines) {
          setPrescribed(json.data.medicines);
        } else {
          setPrescribedFailed(true);
        }
      } catch {
        setPrescribedFailed(true);
      } finally {
        setLoadingPrescribed(false);
      }
    }
    load();
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearched(true);
    setSearchFailed(false);
    setEmergency(false);
    setResults([]);

    try {
      const response = await fetch(
        `/api/medicines/search?q=${encodeURIComponent(q)}`
      );
      const json = await response.json();

      if (json.data?.emergency) {
        setEmergency(true);
        setEmergencyMessage(json.data.emergencyMessage);
      } else {
        setResults(json.data?.results || []);
      }
    } catch {
      setSearchFailed(true);
    } finally {
      setSearching(false);
    }
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="heading-luxury text-2xl md:text-3xl">Medicines</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Prescription facts come from your own documents. General medicine
            information comes from trusted public sources — and the two are
            always kept separate.
          </p>
        </div>

        {/* Emergency notice */}
        {emergency && (
          <Card padding="md" className="border-error/30 bg-error/5">
            <p className="text-sm font-medium text-error">{emergencyMessage}</p>
          </Card>
        )}

        {/* Medicines from your records */}
        <section aria-labelledby="your-medicines-heading">
          <h2 id="your-medicines-heading" className="text-lg font-semibold text-text-primary">
            Medicines in your records
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Extracted from prescriptions you uploaded. Healthfolio never
            recommends starting, stopping, or changing any medicine.
          </p>

          {loadingPrescribed ? (
            <div className="mt-4">
              <SkeletonList count={2} />
            </div>
          ) : prescribedFailed ? (
            <Card padding="md" className="mt-4">
              <p className="text-sm text-text-secondary">
                We couldn&apos;t load your medicines right now. Please try again
                later.
              </p>
            </Card>
          ) : prescribed.length === 0 ? (
            <Card padding="lg" className="mt-4">
              <p className="text-sm text-text-secondary">
                No medicines linked from your prescriptions yet. Upload a
                prescription and confirm the extracted medicines to see them
                here.
              </p>
              <Link href="/records" className="mt-3 inline-block">
                <Button variant="secondary" size="sm">
                  Add a prescription
                </Button>
              </Link>
            </Card>
          ) : (
            <div className="mt-4 space-y-3">
              {prescribed.map((med) => (
                <Card key={med.link.id} padding="md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">
                        {med.entity?.displayName ||
                          med.prescriptionText ||
                          "Unverified name"}
                      </p>
                      {med.prescriptionText && (
                        <p className="mt-0.5 text-xs italic text-text-secondary">
                          As written on your prescription: &ldquo;
                          {med.prescriptionText}&rdquo;
                        </p>
                      )}
                      {med.link.document_id && (
                        <p className="mt-1 text-xs text-text-secondary">
                          Source: your uploaded prescription document
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="verified">From your prescription</Badge>
                      {med.link.document_id && (
                        <Link href="/records">
                          <Button variant="ghost" size="sm">
                            View source
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Safe routine entry point */}
                  <div className="mt-3 border-t border-border pt-3">
                    <Link href="/routine">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                        Set a personal reminder routine
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </Link>
                    <p className="mt-1 text-xs text-text-secondary/80">
                      Reminders are for convenience only — always follow your
                      clinician&apos;s instructions.
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* General medicine lookup */}
        <section aria-labelledby="lookup-heading">
          <h2 id="lookup-heading" className="text-lg font-semibold text-text-primary">
            General medicine information
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Sourced from public references such as RxNorm, DailyMed and openFDA.
            This is general education — not advice about your prescription.
          </p>

          <Card padding="lg" className="mt-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="Search by medicine or active ingredient"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search medicine information"
                className="min-h-touch flex-1 rounded-input border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button onClick={handleSearch} loading={searching}>
                Search
              </Button>
            </div>
          </Card>

          {searching && (
            <div className="mt-4">
              <SkeletonList count={2} />
            </div>
          )}

          {searched && !searching && !emergency && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-text-primary">
                Search results
              </h3>
              {searchFailed ? (
                <Card padding="md" className="mt-2">
                  <p className="text-sm text-text-secondary">
                    We couldn&apos;t reach the medicine references right now.
                    Please try again in a moment.
                  </p>
                </Card>
              ) : results.length === 0 ? (
                <Card padding="lg" className="mt-2">
                  <p className="text-sm text-text-secondary">
                    {SAFETY_DISCLAIMERS.UNAVAILABLE}
                  </p>
                </Card>
              ) : (
                <div className="mt-2 space-y-2">
                  {results.map((result) => (
                    <CardHover key={result.rxcui}>
                      <Link href={`/medicines/${encodeURIComponent(result.rxcui)}`}>
                        <Card
                          padding="md"
                          className="cursor-pointer transition-colors hover:border-primary/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-text-primary">
                                {result.name}
                              </p>
                              <p className="mt-1 text-xs text-text-secondary">
                                {result.genericName && `Generic: ${result.genericName}`}
                                {result.strength && ` · ${result.strength}`}
                                {result.doseForm && ` · ${result.doseForm}`}
                                {result.route && ` · ${result.route}`}
                              </p>
                            </div>
                            <Badge variant="info">{result.source}</Badge>
                          </div>
                        </Card>
                      </Link>
                    </CardHover>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Safety notice */}
        <Card padding="md" className="border-border/50 bg-canvas/60">
          <p className="text-xs leading-relaxed text-text-secondary">
            {SAFETY_DISCLAIMERS.GENERAL}
          </p>
        </Card>
      </div>
    </PageTransition>
  );
}
