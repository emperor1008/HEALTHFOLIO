"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answerType?: string;
  sources?: Array<{
    documentName?: string;
    pageNumber?: number;
    excerpt?: string;
    verificationStatus?: string;
    capabilityId?: string;
    category?: string;
    organization?: string;
    title?: string;
    officialUrl?: string;
    publicationDate?: string;
  }>;
  isAiGenerated?: boolean;
  safetyNotice?: string | null;
  suggestions?: string[];
  clarificationOptions?: string[];
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "What can Healthfolio do?",
  "How do I upload a report?",
  "What medicines are recorded in my documents?",
  "Prepare questions for my next doctor visit",
  "Find contradictions across my reports",
  "How does OCR work?",
];

const SAFETY_NOTICE =
  "Healthfolio organizes and explains your records. It does not provide diagnosis or replace a qualified healthcare professional.";

export default function AskPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflightRef = useRef<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;

      // Generate a stable requestId for idempotency
      const requestId = crypto.randomUUID();

      // Prevent duplicate in-flight requests
      if (inflightRef.current) return;
      inflightRef.current = requestId;

      setError(null);
      setLoading(true);

      const userMsg: ChatMessage = {
        id: `user-${requestId}`,
        role: "user",
        content: q,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, requestId }),
        });

        const data = await res.json();

        if (data.error) {
          setError(data.error.message);
          return;
        }

        const resp = data.data;

        const assistantMsg: ChatMessage = {
          id: `assistant-${requestId}`,
          role: "assistant",
          content: resp.answer,
          answerType: resp.answerType,
          sources: resp.sources || [],
          isAiGenerated: resp.answerType === "personal_record",
          safetyNotice: resp.safetyNotice,
          clarificationOptions: resp.clarificationOptions || [],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setError("Could not reach the AI service. Please try again.");
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    },
    [loading]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSend(input);
  }

  function handleSuggestionClick(question: string) {
    handleSend(question);
  }

  function handleClarification(option: string) {
    handleSend(option);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3 md:px-6">
        <h1 className="text-lg font-semibold text-text-primary">
          Ask Healthfolio
        </h1>
        <p className="text-xs text-text-secondary">
          Questions about your health records and how Healthfolio works
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
              💬
            </div>
            <h2 className="text-xl font-semibold text-text-primary">
              Ask Healthfolio
            </h2>
            <p className="mt-2 max-w-md text-sm text-text-secondary">
              Ask questions about your uploaded records, or learn what
              Healthfolio can do. The assistant will answer using your documents
              when relevant.
            </p>

            {/* Safety notice */}
            <div className="mt-6 max-w-md rounded-card border border-border bg-canvas p-3 text-xs text-text-secondary">
              {SAFETY_NOTICE}
            </div>

            {/* Suggested questions */}
            <div className="mt-8 grid w-full max-w-lg gap-2 sm:grid-cols-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestionClick(q)}
                  disabled={loading}
                  className="rounded-card border border-border bg-surface px-3 py-2.5 text-left text-sm text-text-secondary transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-text-primary disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-card px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "border border-border bg-surface"
              }`}
            >
              {/* Answer type label */}
              {msg.role === "assistant" && msg.answerType && (
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  {msg.answerType === "product_help" && "About Healthfolio"}
                  {msg.answerType === "personal_record" &&
                    "Based on your records"}
                  {msg.answerType === "general_education" &&
                    "General health information"}
                  {msg.answerType === "clarification" && "Quick question"}
                  {msg.answerType === "safety_boundary" && "Safety notice"}
                  {msg.answerType === "emergency" && "⚠️ Emergency notice"}
                  {msg.answerType === "error" && "Error"}
                </p>
              )}

              <p className="whitespace-pre-wrap text-sm">{msg.content}</p>

              {/* Safety notice */}
              {msg.safetyNotice && msg.role === "assistant" && (
                <p className="mt-2 border-t border-border pt-2 text-[10px] text-text-secondary italic">
                  {msg.safetyNotice}
                </p>
              )}

              {/* AI label for personal record answers */}
              {msg.role === "assistant" && msg.isAiGenerated && (
                <p className="mt-2 border-t border-border pt-2 text-[10px] text-text-secondary">
                  AI-generated explanation — verify with your healthcare provider
                </p>
              )}

              {/* Clarification buttons */}
              {msg.clarificationOptions &&
                msg.clarificationOptions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {msg.clarificationOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleClarification(option)}
                        disabled={loading}
                        className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

              {/* Source cards */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <p className="text-[10px] font-medium uppercase text-text-secondary">
                    {msg.answerType === "product_help"
                      ? "Features"
                      : "Sources"}
                  </p>
                  {msg.sources.map((src, idx) => (
                    <div
                      key={idx}
                      className="rounded bg-canvas p-2 text-xs"
                    >
                      {/* Personal record source */}
                      {src.documentName && (
                        <>
                          <span className="font-medium text-text-primary">
                            {src.documentName}
                          </span>
                          <span className="text-text-secondary">
                            {" "}
                            — page {src.pageNumber}
                          </span>
                          <span
                            className={`ml-2 rounded px-1 py-0.5 text-[10px] ${
                              src.verificationStatus === "user_confirmed" ||
                              src.verificationStatus === "system_verified"
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning"
                            }`}
                          >
                            {src.verificationStatus === "user_confirmed"
                              ? "Confirmed"
                              : src.verificationStatus === "system_verified"
                                ? "Verified"
                                : "Pending"}
                          </span>
                          {src.excerpt && (
                            <p className="mt-1 text-text-secondary italic">
                              &ldquo;{src.excerpt.substring(0, 150)}&rdquo;
                            </p>
                          )}
                        </>
                      )}

                      {/* Product help source */}
                      {src.capabilityId && (
                        <span className="font-medium text-text-primary">
                          {src.capabilityId
                            .replace(/-/g, " ")
                            .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                        </span>
                      )}

                      {/* General reference source */}
                      {src.organization && (
                        <>
                          <span className="font-medium text-text-primary">
                            {src.organization}
                          </span>
                          {src.officialUrl && (
                            <a
                              href={src.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary underline"
                            >
                              Visit
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="mb-4 flex justify-start">
            <div className="flex items-center gap-2 rounded-card border border-border bg-surface px-4 py-3">
              <Spinner size="sm" />
              <span className="text-sm text-text-secondary">Thinking…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-card border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            {error}
            <button
              onClick={() => {
                setError(null);
                // Retry the last user message
                const lastUser = [...messages]
                  .reverse()
                  .find((m) => m.role === "user");
                if (lastUser) handleSend(lastUser.content);
              }}
              className="ml-2 text-xs font-medium underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3 md:px-6">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your health records…"
            disabled={loading}
            className="flex-1 rounded-card border border-border bg-canvas px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading}
            loading={loading}
            loadingText="Sending"
            size="sm"
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
