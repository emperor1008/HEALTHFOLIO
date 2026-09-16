"use client";

import { motion, useReducedMotion } from "framer-motion";

interface VerifiedCheckProps {
  /** Pixel size of the icon, defaults to 20 */
  size?: number;
  className?: string;
}

/**
 * Small verified-success check animation.
 * Draws a sage circle then strokes the check path once.
 * Honors prefers-reduced-motion by showing the final state immediately.
 */
export function VerifiedCheck({ size = 20, className = "" }: VerifiedCheckProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
      animate={reduceMotion ? undefined : { scale: 1, opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="#18794E"
        fillOpacity={0.12}
        stroke="#18794E"
        strokeWidth={1.6}
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={reduceMotion ? undefined : { pathLength: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
      <motion.path
        d="M7.5 12.4l3 3 6-6.4"
        stroke="#18794E"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduceMotion ? false : { pathLength: 0 }}
        animate={reduceMotion ? undefined : { pathLength: 1 }}
        transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      />
    </motion.svg>
  );
}
