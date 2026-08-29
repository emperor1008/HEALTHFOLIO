#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────────────────
// Healthfolio Pre-commit Secret Scanner
// ──────────────────────────────────────────────────────────────────────────────
// Scans tracked files for likely secrets and credentials.
// Run: npm run secrets:scan
//
// Lightweight pattern-based scanner. NOT a replacement for gitleaks or
// truffleHog, but catches common mistakes before they reach Git.
// ──────────────────────────────────────────────────────────────────────────────

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SKIP_PATTERNS = [
  /node_modules/,
  /\.next/,
  /package-lock\.json/,
  /\.env\.example$/,
  /tests\/unit\//, // test fixtures may contain dummy keys intentionally
];

const PATTERNS = [
  {
    name: "OpenAI API key",
    severity: "CRITICAL",
    regex: /sk-[a-zA-Z0-9]{20,}/,
    exclude: /process\.env|env\.example|typeof|interface\s|type\s/i,
  },
  {
    name: "Database connection string with credentials",
    severity: "CRITICAL",
    regex: /(postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/,
    exclude: null,
  },
  {
    name: "AWS access key",
    severity: "CRITICAL",
    regex: /AKIA[0-9A-Z]{16}/,
    exclude: null,
  },
  {
    name: "GitHub personal access token",
    severity: "CRITICAL",
    regex: /ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{59}/,
    exclude: null,
  },
  {
    name: "Private key block",
    severity: "CRITICAL",
    regex: /BEGIN (RSA |EC |DSA )?PRIVATE KEY/,
    exclude: null,
  },
  {
    name: "Twilio Account SID",
    severity: "CRITICAL",
    regex: /AC[a-f0-9]{32}/,
    exclude: null,
  },
  {
    name: "JWT secret with value",
    severity: "CRITICAL",
    regex: /jwt[_-]?secret\s*[=:]\s*["'][a-zA-Z0-9]{16,}/,
    exclude: /process\.env/i,
  },
  {
    name: "Generic hardcoded secret assignment",
    severity: "WARNING",
    regex:
      /(api[_-]?key|secret[_-]?key|access[_-]?key|private[_-]?key)\s*[=:]\s*["'][a-zA-Z0-9_\-]{20,}/,
    exclude:
      /process\.env|typeof|interface\s|type\s|import|env\.example|template|placeholder|const [A-Z_]+\s*=/,
  },
  {
    name: "Hardcoded password",
    severity: "WARNING",
    regex: /password\s*=\s*["'][^"']{8,}/,
    exclude:
      /process\.env|typeof|interface\s|type\s|import|env\.example|placeholder|z\.string|\.password|updateUser|newPassword|currentPassword|confirmPassword/i,
  },
];

function getTrackedFiles() {
  try {
    const output = execSync(
      'git ls-files -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.json" "*.md" "*.sh" "*.env*" "*.sql" "*.yml" "*.yaml" "*.toml"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return output
      .split("\n")
      .filter((f) => f.trim())
      .filter((f) => !SKIP_PATTERNS.some((p) => p.test(f)));
  } catch {
    return [];
  }
}

function scanFile(filePath) {
  const issues = [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const pattern of PATTERNS) {
        if (pattern.regex.test(line)) {
          if (pattern.exclude && pattern.exclude.test(line)) continue;
          issues.push({
            file: filePath,
            line: lineNum,
            severity: pattern.severity,
            name: pattern.name,
          });
        }
      }
    }
  } catch {
    // Skip unreadable files
  }
  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log("──────────────────────────────────────────────────────────");
console.log(" Healthfolio Secret Scanner");
console.log("──────────────────────────────────────────────────────────");
console.log("");

const files = getTrackedFiles();
let errors = 0;
let warnings = 0;

for (const file of files) {
  const issues = scanFile(file);
  for (const issue of issues) {
    const color = issue.severity === "CRITICAL" ? "\x1b[31m" : "\x1b[33m";
    const reset = "\x1b[0m";
    console.log(
      `${color}${issue.severity}${reset} ${issue.file}:${issue.line} — Possible ${issue.name}`
    );
    if (issue.severity === "CRITICAL") errors++;
    else warnings++;
  }
}

console.log("");
console.log("──────────────────────────────────────────────────────────");

if (errors > 0) {
  console.log(
    `\x1b[31mFAILED\x1b[0m — ${errors} critical issue(s), ${warnings} warning(s) found`
  );
  console.log("Fix critical issues before committing.");
  process.exit(1);
} else if (warnings > 0) {
  console.log(
    `\x1b[33mPASSED\x1b[0m with ${warnings} warning(s) — review recommended`
  );
  process.exit(0);
} else {
  console.log("\x1b[32mPASSED\x1b[0m — no secrets detected in tracked files");
  process.exit(0);
}
