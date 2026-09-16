"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

interface PageTransitionProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
}

/**
 * Subtle page-level entrance. Fast, small vertical rise + fade.
 * Renders without animation when the user prefers reduced motion.
 */
export function PageTransition({ children, ...props }: PageTransitionProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div {...(props as object)}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

interface CardHoverProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
}

/**
 * Gentle hover/tap elevation for interactive cards.
 */
export function CardHover({ children, ...props }: CardHoverProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div {...(props as object)}>{children}</div>;
  }

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
