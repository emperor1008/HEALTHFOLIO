import coreWebVitals from "eslint-config-next/core-web-vitals";

// Parity with the pre-upgrade .eslintrc.json, which extended only
// "next/core-web-vitals" — next/typescript is intentionally not added here.

const config = [
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", ".freebuff/**"],
  },
  ...coreWebVitals,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
];

export default config;
