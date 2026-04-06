import { useState, useCallback, useRef } from "react";

/**
 * Prevents double submissions by tracking submit state and using
 * a transaction ID for deduplication.
 */
export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastTxRef = useRef<string | null>(null);

  const generateTxId = useCallback(() => {
    const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    lastTxRef.current = id;
    return id;
  }, []);

  const guardedSubmit = useCallback(
    async <T>(fn: (txId: string) => Promise<T>): Promise<T | null> => {
      if (isSubmitting) return null;
      setIsSubmitting(true);
      const txId = generateTxId();
      try {
        return await fn(txId);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, generateTxId]
  );

  return { isSubmitting, guardedSubmit, generateTxId };
}
