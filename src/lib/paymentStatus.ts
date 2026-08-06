// Single source of truth for which sales count as real money.
// Only settled/paid transactions may contribute to revenue, profit and reports.

const PAID_STATUSES = new Set(["PAID", "SUCCESS", "COMPLETED"]);

/** Reference format accepted for manual bank / M-Pesa payment entries. */
export const PAYMENT_REF_REGEX = /^[A-Z0-9-]{6,50}$/;

export function normalizePaymentRef(value: string): string {
  return (value || "").trim().toUpperCase();
}

export function isValidPaymentRef(value: string): boolean {
  return PAYMENT_REF_REGEX.test(normalizePaymentRef(value));
}

/**
 * A sale counts towards financial totals only when its payment is settled.
 * Cash and Credit sales are recorded as PAID at creation time; older rows may
 * have no status at all, which we treat as paid for backwards compatibility.
 */
export function isPaidSale(sale: { payment_status?: string | null }): boolean {
  const status = (sale as any)?.payment_status;
  if (status == null || status === "") return true;
  return PAID_STATUSES.has(String(status).toUpperCase());
}

export function filterPaidSales<T extends { payment_status?: string | null }>(sales: T[]): T[] {
  return sales.filter(isPaidSale);
}
