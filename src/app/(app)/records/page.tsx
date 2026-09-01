"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { AddRecordButton } from "@/components/capture/AddRecordButton";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  type DocumentCategory,
  getProcessingStatusLabel,
} from "@/lib/documents/taxonomy";

interface DocumentRecord {
  id: string;
  original_name: string;
  mime_type: string;
  file_size_bytes: number;
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

export default function RecordsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("documents")
        .select(`
          id, original_name, mime_type, file_size_bytes,
          category, category_confidence, classification_status, processing_status,
          document_date, title, doctor_name, facility_name, summary,
          requires_review, created_at
        `)
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

      const { data: docs } = await query.order(sortBy, { ascending: false }).limit(100);

      setDocuments(docs || []);

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
      // Error handled by UI state
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

  function formatDate(dateStr: string | null): string {
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
    if (confidence === null) return "Not classified";
    if (confidence >= 0.9) return "High confidence";
    if (confidence >= 0.7) return "Moderate confidence";
    return "Low confidence";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
            Medical Records
          </h1>
          <p className="mt-1 text-text-secondary">
            Organized view of your uploaded documents
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/records/reports">
            <Button variant="secondary">Test Reports</Button>
          </Link>
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
        <Card padding="md" className="border-warning/20 bg-warning/5">
          <div className="flex items-center gap-3">
            <span className="text-warning">⚠️</span>
            <div>
              <p className="text-sm font-medium text-warning">
                {reviewCount} document{reviewCount !== 1 ? "s" : ""} need your review
              </p>
              <p className="text-xs text-text-secondary">
                Review AI classifications to confirm or correct categories
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Search and filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="all">All statuses</option>
          <option value="review">Needs review</option>
          <option value="completed">Processed</option>
          <option value="failed">Failed</option>
        </select>
        <div className="flex rounded-lg border border-border">
          <button
            onClick={() => setViewMode("categories")}
            className={`px-3 py-2 text-sm ${viewMode === "categories" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            Categories
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-3 py-2 text-sm ${viewMode === "timeline" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            Timeline
          </button>
        </div>
      </div>

      {/* Empty state */}
      {filteredDocs.length === 0 && (
        <EmptyState
          icon="📋"
          title={searchQuery ? "No matching documents" : "No documents yet"}
          description={
            searchQuery
              ? "Try adjusting your search or filters"
              : "Upload your first medical document to get started"
          }
          action={
            !searchQuery
              ? { label: "Add record", onClick: () => { window.location.href = "/prepare"; } }
              : undefined
          }
        />
      )}

      {/* Category view */}
      {viewMode === "categories" && categoryGroups.length > 0 && (
        <div className="space-y-6">
          {categoryGroups.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{group.icon}</span>
                <h2 className="text-lg font-semibold text-text-primary">{group.label}</h2>
                <Badge variant="processing">{group.count}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onSelect={() => setSelectedDoc(doc)}
                    formatDate={formatDate}
                    getConfidenceLabel={getConfidenceLabel}
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
              formatDate={formatDate}
              getConfidenceLabel={getConfidenceLabel}
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
            formatDate={formatDate}
            getConfidenceLabel={getConfidenceLabel}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Document Card ────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  onSelect,
  formatDate,
  getConfidenceLabel,
  fullWidth,
}: {
  doc: DocumentRecord;
  onSelect: () => void;
  formatDate: (d: string | null) => string;
  getConfidenceLabel: (c: number | null) => string;
  fullWidth?: boolean;
}) {
  const categoryLabel = CATEGORY_LABELS[doc.category as DocumentCategory] || doc.category;
  const categoryIcon = CATEGORY_ICONS[doc.category as DocumentCategory] || "📎";

  return (
    <Card
      padding="md"
      className={`cursor-pointer transition-colors hover:border-primary/30 ${fullWidth ? "" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span>{categoryIcon}</span>
            <span className="text-xs font-medium text-text-secondary">{categoryLabel}</span>
            {doc.requires_review && (
              <Badge variant="review">Review needed</Badge>
            )}
          </div>
          <p className="mt-1 font-medium text-text-primary truncate">
            {doc.title || doc.original_name}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {doc.document_date ? formatDate(doc.document_date) : "Date not found"}
            {doc.facility_name && ` · ${doc.facility_name}`}
          </p>
        </div>
        <Badge variant={
          doc.processing_status === "completed" ? "verified" :
          doc.processing_status === "failed" ? "failed" :
          "processing"
        }>
          {getProcessingStatusLabel(doc.processing_status as any)}
        </Badge>
      </div>
    </Card>
  );
}

// ─── Document Detail ──────────────────────────────────────────────────────

function DocumentDetail({
  doc,
  onClassify,
  classifying,
  formatDate,
  getConfidenceLabel,
}: {
  doc: DocumentRecord;
  onClassify: () => void;
  classifying: boolean;
  formatDate: (d: string | null) => string;
  getConfidenceLabel: (c: number | null) => string;
}) {
  const categoryLabel = CATEGORY_LABELS[doc.category as DocumentCategory] || doc.category;

  return (
    <div className="space-y-4">
      {/* Classification info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Category</p>
          <p className="mt-1 text-sm text-text-primary">{categoryLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Confidence</p>
          <p className="mt-1 text-sm text-text-primary">
            {getConfidenceLabel(doc.category_confidence)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Document date</p>
          <p className="mt-1 text-sm text-text-primary">
            {doc.document_date ? formatDate(doc.document_date) : "Date not found"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Upload date</p>
          <p className="mt-1 text-sm text-text-primary">{formatDate(doc.created_at)}</p>
        </div>
      </div>

      {/* Metadata */}
      {doc.doctor_name && (
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Doctor</p>
          <p className="mt-1 text-sm text-text-primary">{doc.doctor_name}</p>
        </div>
      )}
      {doc.facility_name && (
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Facility</p>
          <p className="mt-1 text-sm text-text-primary">{doc.facility_name}</p>
        </div>
      )}
      {doc.summary && (
        <div>
          <p className="text-xs font-medium uppercase text-text-secondary">Summary</p>
          <p className="mt-1 text-sm text-text-primary">{doc.summary}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 border-t border-border pt-4">
        {(doc.classification_status === "pending" || doc.processing_status === "failed") && (
          <Button
            size="sm"
            loading={classifying}
            onClick={onClassify}
          >
            Classify with AI
          </Button>
        )}
        {doc.requires_review && (
          <Link href={`/review`}>
            <Button variant="secondary" size="sm">Review</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
