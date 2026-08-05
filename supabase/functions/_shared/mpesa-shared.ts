// Shared helpers for the Co-op / M-Pesa payment lifecycle.
// Used by mpesa-stk-push, mpesa-callback, mpesa-transaction-status and
// mpesa-reconcile so every stage classifies and settles payments identically.

export type ErrorCategory =
  | "SUCCESS"
  | "USER_CANCELLED"
  | "USER_TIMEOUT"
  | "USER_INSUFFICIENT_FUNDS"
  | "USER_ACCOUNT_ISSUE"
  | "INVALID_REQUEST"
  | "PROVIDER_ERROR"
  | "PROVIDER_CONFIG"
  | "UPSTREAM_AUTH"
  | "UPSTREAM_UNAVAILABLE"
  | "REFERENCE_NOT_FOUND"
  | "EXPIRED_NO_RESPONSE"
  | "UNKNOWN";

/** True when it is safe to automatically retry the same request. */
export function isRetryableCategory(c: ErrorCategory): boolean {
  return c === "UPSTREAM_UNAVAILABLE" || c === "UPSTREAM_AUTH";
}

/**
 * Map a Co-op / M-Pesa result or message code (plus optional description) to a
 * stable category used for monitoring and for deciding retry behaviour.
 */
export function classifyResult(
  code: string | number | null | undefined,
  description?: string | null,
  httpStatus?: number | null,
): ErrorCategory {
  const c = code == null ? "" : String(code).trim();
  const d = (description || "").toLowerCase();

  if (c === "0" || c === "00" || d.includes("success")) return "SUCCESS";

  switch (c) {
    case "1032":
      return "USER_CANCELLED";
    case "1037":
      return "USER_TIMEOUT";
    case "1":
      return "USER_INSUFFICIENT_FUNDS";
    case "2035":
    case "-8":
      return "USER_ACCOUNT_ISSUE";
    case "-13":
      return "REFERENCE_NOT_FOUND";
    case "1025":
    case "2029":
      return "PROVIDER_ERROR";
    case "2001":
      return "PROVIDER_CONFIG";
    case "EXPIRED":
      return "EXPIRED_NO_RESPONSE";
  }

  if (d.includes("cancel")) return "USER_CANCELLED";
  if (d.includes("timeout") || d.includes("cannot be reached") || d.includes("no response from user")) {
    return "USER_TIMEOUT";
  }
  if (d.includes("insufficient")) return "USER_INSUFFICIENT_FUNDS";
  if (d.includes("debit account authorization")) return "USER_ACCOUNT_ISSUE";
  if (d.includes("does not exist")) return "REFERENCE_NOT_FOUND";

  const http = Number(httpStatus ?? c);
  if (http === 401 || http === 403) return "UPSTREAM_AUTH";
  if (http === 408 || http === 429 || (http >= 500 && http <= 599)) return "UPSTREAM_UNAVAILABLE";
  if (http === 400 || http === 422) return "INVALID_REQUEST";
  if (http === 404) return "PROVIDER_ERROR";

  return c ? "UNKNOWN" : "UNKNOWN";
}

/** Human-friendly, cashier-facing message for a category. */
export function friendlyMessage(category: ErrorCategory, fallback?: string | null): string {
  switch (category) {
    case "USER_CANCELLED":
      return "Customer cancelled the M-Pesa prompt.";
    case "USER_TIMEOUT":
      return "Customer did not respond to the M-Pesa prompt in time.";
    case "USER_INSUFFICIENT_FUNDS":
      return "Customer has insufficient M-Pesa balance.";
    case "USER_ACCOUNT_ISSUE":
      return "Customer's M-Pesa account could not authorise the debit.";
    case "REFERENCE_NOT_FOUND":
      return "The bank has no record of this request. Please start a new payment.";
    case "PROVIDER_CONFIG":
      return "Payment gateway configuration issue. Contact support.";
    case "PROVIDER_ERROR":
      return "The payment provider could not process the request. Please retry.";
    case "UPSTREAM_AUTH":
    case "UPSTREAM_UNAVAILABLE":
      return "Payment provider is temporarily unavailable. Please retry shortly.";
    case "EXPIRED_NO_RESPONSE":
      return "No response received from the payment provider. Payment expired.";
    default:
      return fallback || "Payment could not be completed.";
  }
}

/** Normalise a Kenyan MSISDN to 2547######## / 2541######## form. */
export function normalizePhone(p: string): string {
  const digits = String(p ?? "").replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

/** Strict validation for a Safaricom-capable MSISDN. */
export function isValidKenyanMsisdn(normalized: string): boolean {
  return /^254(7|1)\d{8}$/.test(normalized);
}

/** Sleep helper for backoff. */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Settle a sale for a terminal payment status.
 * SUCCESS routes through the atomic `finalize_sale_payment` RPC so inventory,
 * credit balances and loyalty points are applied exactly once. Non-success only
 * flips the sale's payment_status and never mutates stock.
 */
export async function settleSale(
  admin: any,
  saleId: string | null | undefined,
  paymentStatus: "PAID" | "FAILED" | "CANCELLED" | "PENDING",
): Promise<void> {
  if (!saleId) return;
  if (paymentStatus === "PENDING") return;

  if (paymentStatus === "PAID") {
    const { error } = await admin.rpc("finalize_sale_payment", { p_sale_id: saleId });
    if (error) {
      console.error(JSON.stringify({ evt: "settle_sale_rpc_error", sale_id: saleId, message: error.message }));
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await admin
    .from("sales")
    .update({ payment_status: paymentStatus })
    .eq("id", saleId)
    .neq("payment_status", "PAID");
  if (error) {
    console.error(JSON.stringify({ evt: "settle_sale_update_error", sale_id: saleId, message: error.message }));
  }
}
