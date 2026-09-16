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
import { Modal } from "@/components/ui/Modal";
import { AddRecordButton } from "@/components/capture/AddRecordButton";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  type DocumentCategory,
} from "@/lib/documents/taxonomy";

interface DocumentRecord {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  category: string;
  category_confidence: number | null;
  classification_status: string;
  processing_status: string;
  document_date: string | null;
  title: string | null;
  doctor_name: string | null;
  facility_name: string | null;
  summary: string | null;
  requires_review: boolean;
  relationship_count?: number;
  created_at: string;
}

interface CategoryGroup {
  category: string;
  label: string;
  icon: string;
  count: number;
  documents: DocumentRecord[];
}

type SortBy = "document_date" | "created_at";
type ViewMode = "categories" | "timeline";

/** User-facing status: calm, honest, no internal codes. */
function getStatusChip(doc: DocumentRecord): {
  label: string;
  variant: "verified" | "review" | "processing" | "failed";
} {
  if (doc.requires_review || doc.processing_status === "review_required") {
    return { label: "Review needed", variant: "review" };
  }
  switch (doc.processing_status) {
    case "completed":
      return { label: "Organized", variant: "verified" };
    case "failed":
      return { label: "Needs attention", variant: "failed" };
    case "uploaded":
      return { label: "Queued", variant: "processing" };
    case "extracting":
      return { label: "Reading document", variant: "processing" };
    case "classifying":
      return { label: "Identifying type", variant: "processing" };
    case "organizing":
      return { label: "Organizing", variant: "processing" };
    default:
      return { label: "Processing", variant: "processing" };
  }
}

function formatDocumentDate(dateStr: string | null): string {
  if (!dateStr) return "Date not found";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getConfidenceLabel(confidence: number | null): string {
  if (confidence === null) return "Not classified yet";
  if (confidence >= 0.9) return "Clear match";
  if (confidence >= 0.7) return "Good match";
  return "Uncertain — please verify";
}

export default function RecordsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("document_date");
  const [viewMode, setViewMode] = useState<ViewMode>("categories");
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("documents")
        .select(
          `
          id, original_name, mime_type, size_bytes,
          category, category_confidence, classification_status, processing_status,
          document_date, title, doctor_name, facility_name, summary,
          requires_review, created_at
        `
        )
        .eq("user_id", user.id)
        .is("invalidated_at", null);

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }
      if (statusFilter !== "all") {
        if (statusFilter === "review") {
          query = query.eq("requires_review", true);
        } else {
          query = query.eq("processing_status", statusFilter);
        }
      }

      const { data: docs, error } = await query
        .order(sortBy, { ascending: false })
        .limit(100);

      if (error) {
        setLoadFailed(true);
      } else {
        setDocuments(docs || []);
      }

      // Get portfolio ID for AddRecordButton
      const { data: portfolios } = await supabase
        .from("portfolios")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (portfolios?.[0]) {
        setPortfolioId(portfolios[0].id);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, sortBy]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleClassify(doc: DocumentRecord) {
    setClassifying(true);
    try {
      const response = await fetch(`/api/documents/${doc.id}/organize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "classify" }),
      });
      if (response.ok) {
        loadDocuments();
        setSelectedDoc(null);
      }
    } catch {
      // Error handled by UI state
    } finally {
      setClassifying(false);
    }
  }

  // Filter by search
  const filteredDocs = documents.filter((doc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.original_name.toLowerCase().includes(q) ||
      doc.title?.toLowerCase().includes(q) ||
      doc.doctor_name?.toLowerCase().includes(q) ||
      doc.facility_name?.toLowerCase().includes(q) ||
      doc.summary?.toLowerCase().includes(q)
    );
  });

  // Group by category
  const categoryGroups: CategoryGroup[] = [];
  if (viewMode === "categories") {
    const grouped = new Map<string, DocumentRecord[]>();
    for (const doc of filteredDocs) {
      const cat = doc.category || "unknown";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(doc);
    }
    grouped.forEach((docs, cat) => {
      categoryGroups.push({
        category: cat,
        label: CATEGORY_LABELS[cat as DocumentCategory] || cat,
        icon: CATEGORY_ICONS[cat as DocumentCategory] || "📎",
        count: docs.length,
        documents: docs,
      });
    });
    categoryGroups.sort((a, b) => b.count - a.count);
  }

  const reviewCount = documents.filter((d) => d.requires_review).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="skeleton h-8 w-56" />
          <div className="skeleton h-4 w-72" />
        </div>
        <SkeletonList count={4} />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="heading-luxury text-2xl md:text-3xl">Records</h1>
          <p className="mt-1 text-text-secondary">
            Your organized medical documents
          </p>
        </div>
        <EmptyState
          icon="🌤"
          title="We couldn't load your records right now"
          description="This is usually a connection issue. Your documents are safe."
          action={{ label: "Try again", onClick: loadDocuments }}
        />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="heading-luxury text-2xl md:text-3xl">Records</h1>
            <p className="mt-1 text-text-secondary">
              Organized view of your uploaded documents
            </p>
          </div>
          <div className="flex gap-2">
            {portfolioId && (
              <AddRecordButton
                portfolioId={portfolioId}
                onComplete={() => loadDocuments()}
              />
            )}
          </div>
        </div>

        {/* Review required banner */}
        {reviewCount > 0 && (
          <Card padding="md" className="border-terracotta-border bg-terracotta-soft">
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-terracotta/15 text-terracotta"
                aria-hidden="true"
              >
                !
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {reviewCount} document{reviewCount !== 1 ? "s" : ""} need
                  your review
                </p>
                <p className="text-xs text-text-secondary">
                  Uncertain details are marked so you can confirm or correct
                  them.
                </p>
              </div>
              <Link href="/review">
                <Button variant="secondary" size="sm">
                  Review
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Search and filters */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search documents…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search documents"
            className="min-h-touch min-w-[200px] flex-1 rounded-input border border-border bg-surface px-4 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">All statuses</option>
            <option value="review">Review needed</option>
            <option value="completed">Organized</option>
            <option value="failed">Needs attention</option>
          </select>
          <div className="flex overflow-hidden rounded-input border border-border" role="group" aria-label="View mode">
            <button
              onClick={() => setViewMode("categories")}
              aria-pressed={viewMode === "categories"}
              className={`min-h-touch px-4 text-sm transition-colors ${
                viewMode === "categories"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-canvas"
              }`}
            >
              Categories
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              aria-pressed={viewMode === "timeline"}
              className={`min-h-touch px-4 text-sm transition-colors ${
                viewMode === "timeline"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-canvas"
              }`}
            >
              Timeline
            </button>
          </div>
        </div>

        {/* Empty state */}
        {filteredDocs.length === 0 && (
          <EmptyState
            icon="📋"
            title={
              searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                ? "No matching records"
                : "No records yet"
            }
            description={
              searchQuery || categoryFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Add your first medical record — a photo or a file works."
            }
            action={
              !searchQuery && portfolioId
                ? {
                    label: "Add record",
                    onClick: () => {
                      const el = document.querySelector<HTMLButtonElement>(
                        "[data-add-record-trigger]"
                      );
                      el?.click();
                    },
                  }
                : undefined
            }
          />
        )}

        {/* Category view */}
        {viewMode === "categories" && categoryGroups.length > 0 && (
          <div className="space-y-6">
            {categoryGroups.map((group) => (
              <div key={group.category}>
                <div className="mb-3 flex items-center gap-2">
                  <span aria-hidden="true">{group.icon}</span>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {group.label}
                  </h2>
                  <Badge variant="default">{group.count}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.documents.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onSelect={() => setSelectedDoc(doc)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timeline view */}
        {viewMode === "timeline" && filteredDocs.length > 0 && (
          <div className="space-y-3">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onSelect={() => setSelectedDoc(doc)}
                fullWidth
              />
            ))}
          </div>
        )}

        {/* Document detail modal */}
        <Modal
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
          title={selectedDoc?.title || selectedDoc?.original_name || "Document"}
          size="lg"
        >
          {selectedDoc && (
            <DocumentDetail
              doc={selectedDoc}
              onClassify={() => handleClassify(selectedDoc)}
              classifying={classifying}
            />
          )}
        </Modal>
      </div>
    </PageTransition>
  );
}

// ─── Document Card ────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onSelect,
  fullWidth,
}: {
  doc: DocumentRecord;
  onSelect: () => void;
  fullWidth?: boolean;
}) {
  const categoryLabel =
    CATEGORY_LABELS[doc.category as DocumentCategory] || doc.category;
  const categoryIcon =
    CATEGORY_ICONS[doc.category as DocumentCategory] || "📎";
  const status = getStatusChip(doc);

  return (
    <CardHover className={fullWidth ? "" : "h-full"}>
      <Card
        padding="md"
        role="button"
        tabIndex={0}
        aria-label={`${categoryLabel}: ${doc.title || doc.original_name}`}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`h-full cursor-pointer transition-colors hover:border-primary/30 ${
          fullWidth ? "" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">{categoryIcon}</span>
              <span className="text-xs font-medium text-text-secondary">
                {categoryLabel}
              </span>
              {doc.requires_review && (
                <Badge variant="review">Review needed</Badge>
              )}
            </div>
            <p className="mt-1 truncate font-medium text-text-primary">
              {doc.title || doc.original_name}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {doc.document_date
                ? formatDocumentDate(doc.document_date)
                : "Date not found"}
              {doc.facility_name && ` · ${doc.facility_name}`}
            </p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </Card>
    </CardHover>
  );
}

// ─── Document Detail ──────────────────────────────────────────────────────

function DocumentDetail({
  doc,
  onClassify,
  classifying,
}: {
  doc: DocumentRecord;
  onClassify: () => void;
  classifying: boolean;
}) {
  const categoryLabel =
    CATEGORY_LABELS[doc.category as DocumentCategory] || doc.category;
  const status = getStatusChip(doc);

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center justify-between rounded-card border border-border bg-canvas px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Status
          </p>
          <p className="mt-0.5 text-sm text-text-primary">{status.label}</p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {/* Classification info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Category
          </p>
          <p className="mt-1 text-sm text-text-primary">{categoryLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Confidence
          </p>
          <p className="mt-1 text-sm text-text-primary">
            {getConfidenceLabel(doc.category_confidence)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Document date
          </p>
          <p className="mt-1 text-sm text-text-primary">
            {doc.document_date
              ? formatDocumentDate(doc.document_date)
              : "Date not found"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Added on
          </p>
          <p className="mt-1 text-sm text-text-primary">
            {formatDocumentDate(doc.created_at)}
          </p>
        </div>
      </div>

      {/* Metadata */}
      {doc.doctor_name && (
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Doctor
          </p>
          <p className="mt-1 text-sm text-text-primary">{doc.doctor_name}</p>
        </div>
      )}
      {doc.facility_name && (
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Facility
          </p>
          <p className="mt-1 text-sm text-text-primary">{doc.facility_name}</p>
        </div>
      )}
      {doc.summary && (
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">
            Summary
          </p>
          <p className="mt-1 text-sm text-text-primary">{doc.summary}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 border-t border-border pt-4">
        {(doc.classification_status === "pending" ||
          doc.processing_status === "failed") && (
          <Button size="sm" loading={classifying} onClick={onClassify}>
            Try organizing again
          </Button>
        )}
        {doc.requires_review && (
          <Link href="/review">
            <Button variant="secondary" size="sm">
              Review details
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
