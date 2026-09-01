#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// Healthfolio AI Live Check
// ──────────────────────────────────────────────────────────────────────────────
// Makes real calls to Ollama to verify AI is working.
// Run: npm run ai:check
// ──────────────────────────────────────────────────────────────────────────────

// Load .env.local before reading any process.env values.
// Existing shell environment values take priority (loadEnvConfig does not overwrite).
// Load .env.local before reading any process.env values.
// @next/env loadEnvConfig skips .env.local when NODE_ENV=test,
// so temporarily remove it to ensure .env.local is always loaded.
delete process.env.__NEXT_PROCESSED_ENV;
const savedNodeEnv = process.env.NODE_ENV;
if (savedNodeEnv === "test") delete process.env.NODE_ENV;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
if (savedNodeEnv) process.env.NODE_ENV = savedNodeEnv;

const provider = process.env.AI_PROVIDER || "";
const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const textModel = process.env.OLLAMA_TEXT_MODEL || "qwen2.5:3b";
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
const timeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "30000");

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ollamaUrl);
    const data = JSON.stringify(body);
    const req = require("http").request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, ollamaUrl);
    const req = require("http").get(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout: 5000,
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

async function main() {
  console.log("──────────────────────────────────────────────────────────");
  console.log(" Healthfolio AI Live Check");
  console.log("──────────────────────────────────────────────────────────");
  console.log("");
  console.log(`Provider:     ${provider || "MISSING"}`);
  console.log(`Ollama URL:   ${ollamaUrl}`);
  console.log(`Text model:   ${textModel}`);
  console.log(`Embed model:  ${embeddingModel}`);
  console.log(`Timeout:      ${timeoutMs}ms`);
  console.log("");

  if (!provider || provider !== "ollama") {
    check("AI_PROVIDER=ollama", false, `got "${provider || "empty"}"`);
    console.log("");
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  // 1. Reachability check
  console.log("1. Ollama reachability");
  try {
    const tags = await get("/api/tags");
    check("GET /api/tags returns 200", tags.status === 200);

    const models = (tags.body?.models || []).map((m) => m.name);
    check(
      `Text model "${textModel}" exists`,
      models.some((n) => n === textModel || n.startsWith(textModel + ":")),
      `available: ${models.join(", ") || "none"}`
    );
    check(
      `Embedding model "${embeddingModel}" exists`,
      models.some(
        (n) => n === embeddingModel || n.startsWith(embeddingModel + ":")
      )
    );
  } catch (err) {
    check("Ollama reachable", false, err.message);
    console.log(
      "\n  Hint: Start Ollama with `ollama serve` and pull models with:"
    );
    console.log(`    ollama pull ${textModel}`);
    console.log(`    ollama pull ${embeddingModel}`);
    console.log("");
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  // 2. Chat test — simple non-structured response
  console.log("\n2. Chat test");
  try {
    const chatRes = await post("/api/chat", {
      model: textModel,
      messages: [
        { role: "user", content: "Say exactly: HELLO_FROM_HEALTHFOLIO" },
      ],
      stream: false,
      options: { temperature: 0, num_predict: 20 },
    });
    const content = chatRes.body?.message?.content || "";
    check("POST /api/chat returns 200", chatRes.status === 200);
    check("Chat response is non-empty", content.length > 0, `${content.length} chars`);
    check(
      "Chat response contains expected text",
      content.toUpperCase().includes("HELLO_FROM_HEALTHFOLIO"),
      `got: "${content.substring(0, 80)}"`
    );
  } catch (err) {
    check("Chat test", false, err.message);
  }

  // 3. Structured JSON test
  console.log("\n3. Structured JSON test");
  try {
    const jsonRes = await post("/api/chat", {
      model: textModel,
      messages: [
        {
          role: "system",
          content:
            'Return a JSON object with fields: "greeting" (string) and "number" (integer). Return ONLY valid JSON.',
        },
        { role: "user", content: "Generate the JSON now." },
      ],
      stream: false,
      format: "json",
      options: { temperature: 0, num_predict: 100 },
    });
    const raw = jsonRes.body?.message?.content || "";
    check("POST /api/chat with format=json returns 200", jsonRes.status === 200);

    let parsed;
    try {
      parsed = JSON.parse(raw);
      check("Response is valid JSON", true);
      check(
        'JSON has "greeting" field',
        typeof parsed.greeting === "string",
        `type: ${typeof parsed.greeting}`
      );
      check(
        'JSON has "number" field',
        typeof parsed.number === "number" && Number.isFinite(parsed.number),
        `value: ${parsed.number}`
      );
    } catch {
      check("Response is valid JSON", false, `raw: "${raw.substring(0, 100)}"`);
    }
  } catch (err) {
    check("Structured JSON test", false, err.message);
  }

  // 4. Embedding test
  console.log("\n4. Embedding test");
  try {
    const embedRes = await post("/api/embed", {
      model: embeddingModel,
      input: "Healthfolio medical record",
    });
    check("POST /api/embed returns 200", embedRes.status === 200);

    const embeddings = embedRes.body?.embeddings;
    check(
      "Embeddings array exists",
      Array.isArray(embeddings) && embeddings.length > 0,
      `${embeddings?.length || 0} vectors`
    );

    if (Array.isArray(embeddings) && embeddings.length > 0) {
      const vec = embeddings[0];
      check(
        "Embedding is array of numbers",
        Array.isArray(vec) && vec.length > 0,
        `dimension: ${vec.length}`
      );
      check(
        "Embedding values are finite numbers",
        vec.every((v) => typeof v === "number" && Number.isFinite(v)),
        `sample: [${vec.slice(0, 3).map((v) => v.toFixed(4)).join(", ")}...]`
      );
    }
  } catch (err) {
    check("Embedding test", false, err.message);
  }

  // Summary
  console.log("");
  console.log("──────────────────────────────────────────────────────────");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log("──────────────────────────────────────────────────────────");

  if (failed > 0) {
    console.log("");
    console.log("Setup commands:");
    console.log(`  ollama pull ${textModel}`);
    console.log(`  ollama pull ${embeddingModel}`);
    process.exit(1);
  }

  console.log("");
  console.log("✅ AI is fully operational");
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
});
