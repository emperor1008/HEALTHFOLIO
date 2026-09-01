"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { SAFETY_DISCLAIMERS } from "@/lib/medicines/safety";
import { LABEL_SECTION_LABELS, type LabelSectionKey } from "@/lib/medicines/types";

interface MedicineDetail {
  identity: {
    id: string;
    rxcui: string | null;
    displayName: string;
    entityType: string;
    genericName: string | null;
    brandName: string | null;
    strength: string | null;
    doseForm: string | null;
    route: string | null;
    activeIngredients: Array<{ name: string; strength: string | null; unit: string | null }>;
    sourceStatus: string;
  };
  labelSections: Array<{
    id: string;
    sectionKey: LabelSectionKey;
    sectionTitle: string;
    originalText: string;
    plainLanguageText: string | null;
    aiGenerated: boolean;
    sourceLocator: {
      sourceName: string;
      sourceUrl: string;
      sourceRecordId: string;
      sectionTitle: string;
      effectiveDate: string | null;
      retrievedAt: string;
    };
  }>;
  sourceRecords: Array<{
    id: string;
    sourceName: string;
    sourceRecordId: string;
    sourceUrl: string;
    effectiveDate: string | null;
    retrievedAt: string;
  }>;
  citations: Array<{
    sourceOrganization: string;
    sourceDocumentName: string;
    sourceIdentifier: string;
    sourceUrl: string;
    effectiveDate: string | null;
    retrievedAt: string;
  }>;
  coverageWarnings: string[];
}

export default function MedicineDetailPage() {
  const params = useParams();
  const medicineId = decodeURIComponent(params.medicineId as string);
  const [detail, setDetail] = useState<MedicineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/medicines/${encodeURIComponent(medicineId)}`);
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        setDetail(json.data);
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, [medicineId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function getFreshness(retrievedAt: string): string {
    const age = (Date.now() - new Date(retrievedAt).getTime()) / (1000 * 60 * 60);
    if (age < 24) return "Current";
    if (age < 168) return "Cached";
    if (age < 720) return "May be outdated";
    return "Significantly outdated";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-8">
        <div>
          <Link href="/medicines" className="text-sm text-primary hover:underline">
            ← Back to Medicines
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary md:text-3xl">
            Medicine Detail
          </h1>
        </div>
        <EmptyState
          icon="⚠️"
          title="We couldn't load this medicine's information"
          description={error === "MEDICINE_NOT_FOUND"
            ? SAFETY_DISCLAIMERS.UNAVAILABLE
            : "Check your connection and try again."
          }
          action={{ label: "Try again", onClick: loadDetail }}
        />
      </div>
    );
  }

  const { identity, labelSections, sourceRecords, citations, coverageWarnings } = detail;

  // Group sections by category
  const safetySections = labelSections.filter((s) =>
    ["contraindications", "warnings_and_precautions", "adverse_reactions", "overdosage"].includes(s.sectionKey)
  );
  const dosageSections = labelSections.filter((s) =>
    ["dosage_and_administration", "dosage_forms_and_strengths"].includes(s.sectionKey)
  );
  const useSections = labelSections.filter((s) =>
    ["indications_and_usage", "pediatric_use", "geriatric_use", "pregnancy", "lactation"].includes(s.sectionKey)
  );
  const otherSections = labelSections.filter((s) =>
    !safetySections.includes(s) && !dosageSections.includes(s) && !useSections.includes(s)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/medicines" className="text-sm text-primary hover:underline">
          ← Back to Medicines
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary md:text-3xl">
          {identity.displayName}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {identity.genericName && (
            <Badge variant="processing">Generic: {identity.genericName}</Badge>
          )}
          {identity.strength && (
            <Badge variant="processing">{identity.strength}</Badge>
          )}
          {identity.doseForm && (
            <Badge variant="processing">{identity.doseForm}</Badge>
          )}
          {identity.route && (
            <Badge variant="processing">{identity.route}</Badge>
          )}
        </div>
      </div>

      {/* Coverage warnings */}
      {coverageWarnings.length > 0 && (
        <Card padding="md" className="border-warning/20 bg-warning/5">
          {coverageWarnings.map((w, i) => (
            <p key={i} className="text-xs text-warning">{w}</p>
          ))}
        </Card>
      )}

      {/* Official Uses */}
      {useSections.length > 0 && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-text-primary">Official Uses</h2>
          {useSections.map((section) => (
            <div key={section.id} className="mt-3">
              <h3 className="text-sm font-medium text-text-secondary">
                {LABEL_SECTION_LABELS[section.sectionKey]}
              </h3>
              <div className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                {section.originalText.substring(0, 500)}
                {section.originalText.length > 500 && "..."}
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Source: {section.sourceLocator.sourceName} · Retrieved: {new Date(section.sourceLocator.retrievedAt).toLocaleDateString("en-IN")}
              </p>
            </div>
          ))}
        </Card>
      )}

      {/* Official Dosage */}
      {dosageSections.length > 0 && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-text-primary">Official Label Dosage</h2>
          <p className="mt-1 text-xs text-text-secondary">{SAFETY_DISCLAIMERS.LABEL}</p>
          {dosageSections.map((section) => (
            <div key={section.id} className="mt-3">
              <h3 className="text-sm font-medium text-text-secondary">
                {LABEL_SECTION_LABELS[section.sectionKey]}
              </h3>
              <div className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                {section.originalText.substring(0, 1000)}
                {section.originalText.length > 1000 && "..."}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Safety Sections */}
      {safetySections.length > 0 && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-text-primary">Warnings and Safety</h2>
          {safetySections.map((section) => (
            <div key={section.id} className="mt-3 border-t border-border pt-3">
              <button
                onClick={() => toggleSection(section.sectionKey)}
                className="flex w-full items-center justify-between text-left"
              >
                <h3 className="text-sm font-medium text-text-secondary">
                  {LABEL_SECTION_LABELS[section.sectionKey]}
                </h3>
                <span className="text-xs text-text-secondary">
                  {expandedSections.has(section.sectionKey) ? "▼" : "▶"}
                </span>
              </button>
              {expandedSections.has(section.sectionKey) && (
                <div className="mt-2 text-sm text-text-primary whitespace-pre-wrap">
                  {section.originalText}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Other Sections */}
      {otherSections.length > 0 && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-text-primary">Additional Information</h2>
          {otherSections.map((section) => (
            <div key={section.id} className="mt-3 border-t border-border pt-3">
              <button
                onClick={() => toggleSection(section.sectionKey)}
                className="flex w-full items-center justify-between text-left"
              >
                <h3 className="text-sm font-medium text-text-secondary">
                  {LABEL_SECTION_LABELS[section.sectionKey]}
                </h3>
                <span className="text-xs text-text-secondary">
                  {expandedSections.has(section.sectionKey) ? "▼" : "▶"}
                </span>
              </button>
              {expandedSections.has(section.sectionKey) && (
                <div className="mt-2 text-sm text-text-primary whitespace-pre-wrap">
                  {section.originalText.substring(0, 2000)}
                  {section.originalText.length > 2000 && "..."}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* No sections available */}
      {labelSections.length === 0 && (
        <Card padding="lg">
          <p className="text-sm text-text-secondary">
            {SAFETY_DISCLAIMERS.UNAVAILABLE}
          </p>
        </Card>
      )}

      {/* Sources */}
      {citations.length > 0 && (
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-text-primary">Sources and Data Freshness</h2>
          <div className="mt-3 space-y-2">
            {citations.map((citation, i) => (
              <div key={i} className="text-xs text-text-secondary">
                <p>
                  <span className="font-medium">{citation.sourceOrganization}</span>
                  {" · "}
                  <a href={citation.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {citation.sourceDocumentName}
                  </a>
                </p>
                {citation.effectiveDate && (
                  <p>Effective: {citation.effectiveDate}</p>
                )}
                <p>Retrieved: {new Date(citation.retrievedAt).toLocaleDateString("en-IN")}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Safety notice */}
      <Card padding="md" className="border-border/50 bg-canvas/50">
        <p className="text-xs text-text-secondary leading-relaxed">
          {SAFETY_DISCLAIMERS.GENERAL}
        </p>
      </Card>
    </div>
  );
}
