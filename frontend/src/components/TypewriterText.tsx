import React, { useEffect, useState } from "react";
import { motion } from "motion/react";

export function TypewriterText({ text, delay = 0, onComplete, hasTypedBefore }: { text: string, delay?: number, onComplete?: () => void, hasTypedBefore?: boolean }) {
  useEffect(() => {
    if (hasTypedBefore) {
      if (onComplete) onComplete();
      return;
    }
    const timeout = setTimeout(() => {
      if (onComplete) onComplete();
    }, delay + 600); // give it time to animate
    return () => clearTimeout(timeout);
  }, [delay, hasTypedBefore, onComplete]);

  if (hasTypedBefore) {
    return <span>{text}</span>;
  }

  return (
    <motion.span
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: "easeOut" }}
    >
      {text}
    </motion.span>
  );
}
