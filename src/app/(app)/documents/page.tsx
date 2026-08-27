"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

interface Document {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  document_type: string;
  status: string;
  page_count: number | null;
  created_at: string;
}

export default function DocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocuments() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: docs } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setDocuments(docs || []);
      setLoading(false);
    }

    loadDocuments();
  }, []);

  async function handlePreview(doc: Document) {
    setPreviewDoc(doc);
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.id + "/" + doc.original_name, 3600);
    setPreviewUrl(data?.signedUrl || null);
  }

  async function handleDelete(docId: string) {
    if (!confirm("Are you sure you want to delete this document? This cannot be undone.")) return;

    const supabase = createClient();
    await supabase.from("documents").delete().eq("id", docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    setPreviewDoc(null);
    setPreviewUrl(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Documents
        </h1>
        <p className="mt-1 text-text-secondary">
          Your uploaded medical records.
        </p>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon="📄"
          title="No documents yet"
          description="Upload medical records to get started with Healthfolio."
          action={{
            label: "Upload documents",
            onClick: () => router.push("/prepare"),
          }}
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id} padding="md" className="hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">
                    {doc.original_name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                    <span>{formatFileSize(doc.size_bytes)}</span>
                    <span>•</span>
                    <span className="capitalize">{doc.document_type.replace("_", " ")}</span>
                    {doc.page_count && (
                      <>
                        <span>•</span>
                        <span>{doc.page_count} page{doc.page_count !== 1 ? "s" : ""}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(doc.created_at).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      doc.status === "verified"
                        ? "verified"
                        : doc.status === "review_required"
                        ? "review"
                        : doc.status === "processing"
                        ? "processing"
                        : doc.status === "failed"
                        ? "failed"
                        : doc.status === "excluded"
                        ? "excluded"
                        : "default"
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreview(doc)}
                    aria-label={`Preview ${doc.original_name}`}
                  >
                    Preview
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => {
          setPreviewDoc(null);
          setPreviewUrl(null);
        }}
        title={previewDoc?.original_name || ""}
        size="lg"
      >
        {previewUrl ? (
          previewDoc?.mime_type === "application/pdf" ? (
            <iframe
              src={previewUrl}
              className="h-[60vh] w-full rounded-card border border-border"
              title={`Preview of ${previewDoc?.original_name}`}
            />
          ) : (
            <img
              src={previewUrl}
              alt={`Preview of ${previewDoc?.original_name}`}
              className="max-h-[60vh] w-auto rounded-card border border-border"
            />
          )
        ) : (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        )}
        <div className="mt-4 flex justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => previewDoc && handleDelete(previewDoc.id)}
          >
            Delete document
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
