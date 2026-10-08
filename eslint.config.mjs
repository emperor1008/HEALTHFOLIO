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
      // `react-hooks/set-state-in-effect` (new in eslint-plugin-react-hooks v7)
      // flags the standard client-component patterns this codebase relies on:
      // one-off data fetching in an Effect and "render nothing until mounted"
      // hydration gates — both endorsed by React's own docs. It is a heuristic,
      // not a bug detector, so it is a warning (kept visible) rather than a
      // blocking error. Genuine cases are fixed where a clean alternative exists.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
