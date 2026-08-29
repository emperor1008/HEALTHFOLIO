#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// Healthfolio AI Configuration Check
// ──────────────────────────────────────────────────────────────────────────────
// Reports whether AI is configured without exposing secrets.
// Run: npm run ai:check
// ──────────────────────────────────────────────────────────────────────────────

const provider = process.env.AI_PROVIDER || "";
const ollamaUrl = process.env.OLLAMA_BASE_URL || "";
const textModel = process.env.OLLAMA_TEXT_MODEL || "";
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || "";
const timeout = process.env.AI_REQUEST_TIMEOUT_MS || "";

console.log("──────────────────────────────────────────────────────────");
console.log(" Healthfolio AI Configuration Check");
console.log("──────────────────────────────────────────────────────────");
console.log("");
console.log(`AI Provider:           ${provider || "MISSING"}`);
console.log(`Ollama Base URL:       ${ollamaUrl ? "configured" : "MISSING"}`);
console.log(`Text Model:            ${textModel || "MISSING"}`);
console.log(`Embedding Model:       ${embeddingModel || "configured (optional)"}`);
console.log(`Request Timeout:       ${timeout || "120000 (default)"}ms`);
console.log("");

if (!provider) {
  console.log("❌ AI provider not configured.");
  console.log("   Set AI_PROVIDER=ollama in .env.local");
  process.exit(1);
}

if (provider === "ollama") {
  if (!ollamaUrl) {
    console.log("❌ Ollama URL not configured.");
    console.log("   Set OLLAMA_BASE_URL=http://127.0.0.1:11434 in .env.local");
    process.exit(1);
  }

  if (!textModel) {
    console.log("❌ Text model not configured.");
    console.log("   Set OLLAMA_TEXT_MODEL=qwen2.5:3b in .env.local");
    process.exit(1);
  }

  // Try to reach Ollama
  const http = require("http");
  const url = new URL(ollamaUrl);

  console.log(`Checking Ollama at ${ollamaUrl}...`);

  const req = http.get(
    {
      hostname: url.hostname,
      port: url.port,
      path: "/api/tags",
      timeout: 5000,
    },
    (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const tags = JSON.parse(data);
          const models = (tags.models || []).map((m) => m.name);
          const textModelAvailable = models.some(
            (n) => n === textModel || n.startsWith(textModel + ":")
          );
          const embedModelAvailable = embeddingModel
            ? models.some(
                (n) =>
                  n === embeddingModel || n.startsWith(embeddingModel + ":")
              )
            : null;

          console.log("");
          console.log(`✅ Ollama is reachable`);
          console.log(
            `   Text model "${textModel}": ${textModelAvailable ? "✅ available" : "❌ NOT FOUND"}`
          );
          if (embeddingModel) {
            console.log(
              `   Embedding model "${embeddingModel}": ${embedModelAvailable ? "✅ available" : "❌ NOT FOUND"}`
            );
          }
          console.log(
            `   Available models: ${models.length > 0 ? models.join(", ") : "none"}`
          );
          console.log("");

          if (!textModelAvailable) {
            console.log(`Run: ollama pull ${textModel}`);
            process.exit(1);
          }
          if (embeddingModel && !embedModelAvailable) {
            console.log(`Run: ollama pull ${embeddingModel}`);
            process.exit(1);
          }

          console.log("✅ AI is ready");
          process.exit(0);
        } catch (e) {
          console.log("❌ Could not parse Ollama response");
          process.exit(1);
        }
      });
    }
  );

  req.on("error", (err) => {
    console.log(`❌ Cannot connect to Ollama: ${err.message}`);
    console.log("   Make sure Ollama is running: ollama serve");
    process.exit(1);
  });

  req.on("timeout", () => {
    console.log("❌ Ollama connection timed out");
    req.destroy();
    process.exit(1);
  });
} else if (provider === "openai") {
  const apiKey = process.env.AI_API_KEY;
  console.log(`API Key:               ${apiKey ? "configured" : "MISSING"}`);
  console.log("");
  if (apiKey) {
    console.log("✅ OpenAI is configured");
  } else {
    console.log("❌ AI_API_KEY not set");
    process.exit(1);
  }
} else {
  console.log(`Unknown provider: ${provider}`);
  process.exit(1);
}
