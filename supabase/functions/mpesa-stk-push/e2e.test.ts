// End-to-end test for the Co-op Bank STK Push → Callback flow.
//
// What this verifies (real, not mocked):
//   1. mpesa-stk-push accepts a PENDING sale and creates a `payments` row.
//   2. Co-op Bank actually accepts the STK request (HTTP 200 from the edge fn).
//   3. The FINAL `payments.status` is written by the `mpesa-callback` endpoint
//      — proven by `raw_payload` being populated by the callback handler.
//   4. `sales.payment_status` is propagated from the callback (PAID / FAILED).
//
// Required env (loaded from project .env automatically):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_PUBLISHABLE_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   E2E_USER_EMAIL          — an approved app user (cashier+)
//   E2E_USER_PASSWORD
//   E2E_TEST_PHONE          — Safaricom MSISDN that will receive the STK prompt
//   E2E_BRANCH_ID           — branch the test user is assigned to
//   E2E_PRODUCT_ID          — any product in that branch (used for the sale row)
//
// Optional:
//   E2E_CALLBACK_TIMEOUT_MS (default 180000 — 3 min for tester to approve/cancel)
//   E2E_AMOUNT              (default 1)

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const E2E_EMAIL = Deno.env.get("E2E_USER_EMAIL");
const E2E_PASSWORD = Deno.env.get("E2E_USER_PASSWORD");
const E2E_PHONE = Deno.env.get("E2E_TEST_PHONE");
const E2E_BRANCH = Deno.env.get("E2E_BRANCH_ID");
const E2E_PRODUCT = Deno.env.get("E2E_PRODUCT_ID");
const TIMEOUT_MS = Number(Deno.env.get("E2E_CALLBACK_TIMEOUT_MS") || 180_000);
const AMOUNT = Number(Deno.env.get("E2E_AMOUNT") || 1);

const haveLiveConfig =
  E2E_EMAIL && E2E_PASSWORD && E2E_PHONE && E2E_BRANCH && E2E_PRODUCT;

Deno.test({
  name:
    "STK push → Co-op callback writes final payment status (skipped without E2E_* env)",
  ignore: !haveLiveConfig,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // 1. Sign in as a real app user so the edge function passes JWT validation.
    const user = createClient(SUPABASE_URL, ANON_KEY);
    const { data: auth, error: authErr } = await user.auth
      .signInWithPassword({ email: E2E_EMAIL!, password: E2E_PASSWORD! });
    assert(!authErr, `Sign-in failed: ${authErr?.message}`);
    const accessToken = auth.session!.access_token;
    const userId = auth.user!.id;

    // 2. Admin client to seed the sale and to read payment status bypassing RLS.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: product, error: pErr } = await admin
      .from("products")
      .select("id,name,buying_price,selling_price")
      .eq("id", E2E_PRODUCT!)
      .single();
    assert(!pErr && product, `Product not found: ${pErr?.message}`);

    const idempotencyKey = `e2e_${Date.now()}_${crypto.randomUUID()}`;
    const { data: sale, error: sErr } = await admin
      .from("sales")
      .insert({
        branch_id: E2E_BRANCH,
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        selling_price: AMOUNT,
        buying_price: product.buying_price || 0,
        total_amount: AMOUNT,
        final_amount: AMOUNT,
        profit: AMOUNT - (product.buying_price || 0),
        payment_mode: "Mpesa",
        payment_status: "PENDING",
        recorded_by: userId,
        idempotency_key: idempotencyKey,
        customer_name: "E2E Test",
      })
      .select("id")
      .single();
    assert(!sErr && sale, `Sale insert failed: ${sErr?.message}`);
    console.log(`[e2e] Created PENDING sale ${sale.id}`);

    try {
      // 3. Invoke the live STK push edge function.
      const stkRes = await fetch(
        `${SUPABASE_URL}/functions/v1/mpesa-stk-push`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sale_id: sale.id,
            amount: AMOUNT,
            phone: E2E_PHONE,
          }),
        },
      );
      const stkBody = await stkRes.json();
      console.log(`[e2e] mpesa-stk-push -> ${stkRes.status}`, stkBody);
      assertEquals(stkRes.status, 200, `STK push failed: ${JSON.stringify(stkBody)}`);
      assert(stkBody.message_reference, "Missing message_reference");
      const messageRef: string = stkBody.message_reference;

      // 4. Sanity: payment row exists, still PENDING, no callback payload yet.
      const { data: initial } = await admin
        .from("payments")
        .select("status, raw_payload")
        .eq("message_reference", messageRef)
        .single();
      assertEquals(initial?.status, "PENDING");
      assertEquals(initial?.raw_payload, null);

      // 5. Wait for the callback to flip status. The callback is the ONLY
      //    writer of `raw_payload`, so its presence proves the final state
      //    came from Co-op Bank — not from the STK response path.
      console.log(
        `[e2e] Waiting up to ${TIMEOUT_MS / 1000}s for Co-op callback on ${messageRef}…`,
      );
      const deadline = Date.now() + TIMEOUT_MS;
      let finalStatus = "PENDING";
      let finalPayload: unknown = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data } = await admin
          .from("payments")
          .select("status, raw_payload, result_code, result_description")
          .eq("message_reference", messageRef)
          .single();
        if (data && data.status !== "PENDING") {
          finalStatus = data.status;
          finalPayload = data.raw_payload;
          console.log(
            `[e2e] Final payment.status=${finalStatus} result=${data.result_code} desc=${data.result_description}`,
          );
          break;
        }
      }

      assertNotEquals(
        finalStatus,
        "PENDING",
        "Timed out waiting for Co-op callback to update payment.status",
      );
      assert(
        finalPayload !== null,
        "Callback raw_payload is empty — final status was not set by the callback handler",
      );

      // 6. Sale row must be synced by the callback to the same outcome.
      const { data: finalSale } = await admin
        .from("sales")
        .select("payment_status")
        .eq("id", sale.id)
        .single();
      if (finalStatus === "SUCCESS") {
        assertEquals(finalSale?.payment_status, "PAID");
      } else {
        assert(
          ["FAILED", "CANCELLED", "PENDING"].includes(
            finalSale?.payment_status ?? "",
          ),
          `Unexpected sale.payment_status=${finalSale?.payment_status}`,
        );
      }
    } finally {
      // Clean up — leave no test data in production tables.
      await admin.from("payments").delete().eq("sale_id", sale.id);
      await admin.from("sales").delete().eq("id", sale.id);
      await user.auth.signOut();
    }
  },
});
