"use client";

/**
 * Page-query client — the single place where page components fetch the data
 * they previously read via browser Supabase. Every call hits an authenticated
 * Healthfolio API route; ownership is enforced server-side.
 */
import { getJSON, postJSON, deleteJSON } from "@/lib/api/browser-bridge";

export interface DocumentRow {
  id: string;
  original_name: string;
  title: string | null;
  category: string | null;
  document_type: string;
  size_bytes: number | null;
  page_count: number | null;
  processing_status: string;
  requires_review: boolean | null;
  created_at: string;
  portfolio_id: string;
}

export interface ExtractionRow {
  id: string;
  document_id: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

function eqParam(name: string, value: string): string {
  return `eq=${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

/** Documents list for the signed-in user. */
export async function listDocuments(limit = 100): Promise<DocumentRow[]> {
  const data = await getJSON<{ rows: DocumentRow[] }>(
    `/api/user-data/documents?select=id,original_name,title,category,document_type,size_bytes,page_count,processing_status,requires_review,created_at,portfolio_id&limit=${limit}`
  );
  return data.rows;
}

/** Pending-review count for the documents screen. */
export async function pendingReviewCount(): Promise<number> {
  const data = await getJSON<{ count: number }>("/api/user-data/pending-count");
  return data.count;
}

/** Delete one of the user's documents. */
export async function deleteDocument(id: string): Promise<void> {
  await deleteJSON(`/api/user-data/documents?id=${id}`);
}

/** Short-lived signed URL for previewing the user's own document. */
export async function documentSignedUrl(id: string): Promise<string | null> {
  const data = await postJSON<{ url: string | null }>(
    `/api/documents/${id}/signed-url`,
    {}
  );
  return data.url;
}

/** Generic authenticated rows fetch for allow-listed tables. */
export async function rows<T>(
  table: string,
  opts: {
    select?: string;
    limit?: number;
    eq?: Array<[string, string]>;
    order?: string;
  } = {}
): Promise<T[]> {
  const params = new URLSearchParams();
  params.set("select", opts.select ?? "id");
  if (opts.limit) params.set("limit", String(opts.limit));
  for (const [col, val] of opts.eq ?? []) params.append("eq", `${col}=${val}`);
  if (opts.order) params.set("order", opts.order);
  const data = await getJSON<{ rows: T[] }>(
    `/api/user-data/${table}?${params.toString()}`
  );
  return data.rows;
}

/** Extractions for a document (user-scoped server-side). */
export async function documentExtractions(documentId: string): Promise<ExtractionRow[]> {
  return rows<ExtractionRow>("extractions", {
    select: "id,document_id,status,payload,created_at",
    eq: [["document_id", documentId]],
    limit: 50,
  });
}
