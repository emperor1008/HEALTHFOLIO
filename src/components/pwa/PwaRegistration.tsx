"use client";

/** Registers the service worker once, after page load. No UI output. */
import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !window.location.search.includes("sw=1")) {
      // Keep dev servers SW-free unless explicitly requested (?sw=1) to avoid
      // caching HMR payloads during development.
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal: the app works without it.
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
