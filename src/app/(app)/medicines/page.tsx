"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
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
  const [prescribed, setPrescribed] = useState<PrescribedMedicine[]>([]);
  const [loadingPrescribed, setLoadingPrescribed] = useState(true);
  const [emergency, setEmergency] = useState(false);
  const [emergencyMessage, setEmergencyMessage] = useState("");

  // Load prescribed medicines
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const response = await fetch("/api/medicines/link");
        const json = await response.json();
        if (json.data?.medicines) {
          setPrescribed(json.data.medicines);
        }
      } catch {
        // Error handled by UI state
      } finally {
        setLoadingPrescribed(false);
      }
    }
    load();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    setEmergency(false);
    setResults([]);

    try {
      const response = await fetch(`/api/medicines/search?q=${encodeURIComponent(query.trim())}`);
      const json = await response.json();

      if (json.data?.emergency) {
        setEmergency(true);
        setEmergencyMessage(json.data.emergencyMessage);
      } else {
        setResults(json.data?.results || []);
      }
    } catch {
      setResults([]);
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Medicine Information
        </h1>
        <p className="mt-1 text-text-secondary text-sm">
          {SAFETY_DISCLAIMERS.GENERAL}
        </p>
      </div>

      {/* Emergency message */}
      {emergency && (
        <Card padding="md" className="border-error/20 bg-error/5">
          <p className="text-sm font-medium text-error">{emergencyMessage}</p>
        </Card>
      )}

      {/* Search */}
      <Card padding="lg">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by medicine or active ingredient"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary"
          />
          <Button onClick={handleSearch} loading={searching}>
            Search
          </Button>
        </div>
      </Card>

      {/* Search results */}
      {searched && !searching && !emergency && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Search Results
          </h2>
          {results.length === 0 ? (
            <Card padding="lg" className="mt-3">
              <p className="text-sm text-text-secondary">
                {SAFETY_DISCLAIMERS.UNAVAILABLE}
              </p>
            </Card>
          ) : (
            <div className="mt-3 space-y-2">
              {results.map((result) => (
                <Link
                  key={result.rxcui}
                  href={`/medicines/${encodeURIComponent(result.rxcui)}`}
                >
                  <Card padding="md" className="cursor-pointer transition-colors hover:border-primary/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-primary">{result.name}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {result.genericName && `Generic: ${result.genericName}`}
                          {result.strength && ` · ${result.strength}`}
                          {result.doseForm && ` · ${result.doseForm}`}
                          {result.route && ` · ${result.route}`}
                        </p>
                      </div>
                      <Badge variant="processing">{result.source}</Badge>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prescribed medicines */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Medicines in Your Records
        </h2>
        {loadingPrescribed ? (
          <div className="mt-3 flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : prescribed.length === 0 ? (
          <Card padding="lg" className="mt-3">
            <p className="text-sm text-text-secondary">
              No medicines linked from your prescriptions yet.
              Upload a prescription to extract medicine information.
            </p>
          </Card>
        ) : (
          <div className="mt-3 space-y-2">
            {prescribed.map((med) => (
              <Card key={med.link.id} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-text-primary">
                      {med.entity?.displayName || med.prescriptionText || "Unknown medicine"}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {med.prescriptionText}
                    </p>
                  </div>
                  <Badge variant="verified">Prescribed</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
