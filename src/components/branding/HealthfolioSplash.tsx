"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Image from "next/image";

const SESSION_KEY = "healthfolio:splash-seen";
const SPLASH_DURATION_MS = 2200;
const EXIT_DURATION_MS = 400;

/**
 * Premium animated splash screen for Healthfolio.
 *
 * Shows once per browser tab session using sessionStorage.
 * Supports prefers-reduced-motion for accessibility.
 * Uses the supplied logo without modification.
 *
 * Handles React Strict Mode double-effect correctly:
 * - sessionStorage is only written when the timer fires
 * - A ref tracks the timer so cleanup works across re-mounts
 */
export function HealthfolioSplash() {
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if splash was already seen in this tab session
    try {
      if (sessionStorage.getItem(SESSION_KEY)) {
        return;
      }
    } catch {
      // sessionStorage unavailable — skip splash
      return;
    }

    // Clear any existing timer (handles Strict Mode re-mount)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Prevent background scrolling
    document.body.style.overflow = "hidden";
    setVisible(true);

    // Schedule removal
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
      document.body.style.overflow = "";

      // Mark as seen AFTER the animation completes
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Ignore
      }
    }, SPLASH_DURATION_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      document.body.style.overflow = "";
    };
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          aria-hidden="true"
          role="presentation"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT_DURATION_MS / 1000, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: "#F7F5EF" }}
        >
          {/* Subtle radial glow */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 45%, rgba(15,92,94,0.06) 0%, rgba(15,92,94,0.02) 40%, transparent 70%)",
            }}
          />

          {/* Logo container */}
          <motion.div
            className="relative z-10"
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.82, y: 14 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0, scale: 0.95 }
                : { opacity: 0, scale: 0.95, y: -8 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.4, ease: "easeOut" }
                : {
                    opacity: { duration: 0.6, ease: "easeOut" },
                    scale: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
                    y: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
                  }
            }
          >
            {/* Light sweep effect */}
            {!prefersReducedMotion && (
              <motion.div
                className="absolute inset-0 overflow-hidden rounded-2xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.2 }}
              >
                <motion.div
                  className="absolute inset-y-0 -left-full w-1/3"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
                  }}
                  animate={{ left: ["-100%", "200%"] }}
                  transition={{
                    duration: 1.2,
                    delay: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </motion.div>
            )}

            {/* Plus pulse */}
            {!prefersReducedMotion && (
              <motion.div
                className="absolute left-1/2 top-1/2 -translate-x-[45%] -translate-y-[55%]"
                initial={{ opacity: 0, scale: 1 }}
                animate={{
                  opacity: [0, 0.3, 0],
                  scale: [1, 1.8, 2.2],
                }}
                transition={{
                  duration: 1.0,
                  delay: 1.0,
                  ease: "easeOut",
                }}
              >
                <div
                  className="h-4 w-4 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(15,92,94,0.15) 0%, transparent 70%)",
                  }}
                />
              </motion.div>
            )}

            {/* Logo image */}
            <Image
              src="/branding/healthfolio-logo.png"
              alt="Healthfolio"
              width={340}
              height={340}
              priority
              className="h-auto w-[220px] sm:w-[280px] md:w-[340px]"
              style={{ objectFit: "contain" }}
              sizes="(max-width: 640px) 220px, (max-width: 1024px) 280px, 340px"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
