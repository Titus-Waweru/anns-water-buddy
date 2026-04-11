import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    console.log("Received M-PESA callback:", JSON.stringify(body, null, 2));

    // Extract stkCallback from body
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) {
      console.warn("Missing stkCallback in request body");
      // Still return 200 to acknowledge receipt
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract CallbackMetadata
    const callbackMetadata = stkCallback.CallbackMetadata;
    if (!callbackMetadata) {
      console.warn("Missing CallbackMetadata in stkCallback");
      // Still return 200 to acknowledge receipt
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract individual fields from CallbackMetadata.Item array
    const metadataItems = callbackMetadata.Item || [];
    const metadata = {};
    
    metadataItems.forEach((item: { Name: string; Value: unknown }) => {
      metadata[item.Name] = item.Value;
    });

    // Extract required fields
    const amount = metadata["Amount"];
    const mpesaReceiptNumber = metadata["MpesaReceiptNumber"];
    const phoneNumber = metadata["PhoneNumber"];
    const transactionDate = metadata["TransactionDate"];

    // Log extracted data
    console.log("Extracted callback data:", {
      amount,
      mpesaReceiptNumber,
      phoneNumber,
      transactionDate,
      resultCode: stkCallback.ResultCode,
      resultDescription: stkCallback.ResultDesc,
      merchantRequestId: stkCallback.MerchantRequestID,
      checkoutRequestId: stkCallback.CheckoutRequestID,
    });

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing Supabase credentials");
      // Return 200 anyway to avoid retries from M-PESA
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Save transaction to database
    if (
      amount !== undefined &&
      mpesaReceiptNumber &&
      phoneNumber &&
      transactionDate
    ) {
      try {
        const { error: insertError } = await supabase
          .from("mpesa_transactions")
          .insert({
            amount: Number(amount),
            mpesa_receipt_number: String(mpesaReceiptNumber),
            phone_number: String(phoneNumber),
            transaction_date: new Date(
              String(transactionDate).match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
                ? String(transactionDate).replace(
                    /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
                    "$1-$2-$3T$4:$5:$6Z"
                  )
                : transactionDate
            ),
            result_code: stkCallback.ResultCode,
            result_description: stkCallback.ResultDesc,
            merchant_request_id: stkCallback.MerchantRequestID,
            checkout_request_id: stkCallback.CheckoutRequestID,
            raw_callback_data: body,
          });

        if (insertError) {
          console.error("Database insert error:", insertError);
        } else {
          console.log(
            `Successfully saved transaction: ${mpesaReceiptNumber} for ${phoneNumber}`
          );
        }
      } catch (dbError) {
        console.error("Database operation failed:", dbError);
      }
    } else {
      console.warn("Missing required callback fields for database insert:", {
        amount,
        mpesaReceiptNumber,
        phoneNumber,
        transactionDate,
      });
    }

    // Always return 200 OK immediately to acknowledge receipt
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mpesa-callback error:", error);
    // Return 200 anyway to prevent M-PESA retries on parse errors
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
