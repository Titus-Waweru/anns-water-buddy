import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // STEP 1: Request received
    console.log("=== MPESA CALLBACK DEBUG START ===");
    console.log("STEP 1: request received");
    console.log("SUPABASE_URL exists:", !!process.env.SUPABASE_URL);
    console.log("SERVICE_ROLE_KEY exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    // STEP 2: Body parsed
    const body = req.body;
    console.log("STEP 2: body parsed");
    console.log("Received M-PESA callback:", JSON.stringify(body, null, 2));

    // Extract stkCallback from body
    // STEP 3: stkCallback extracted
    const stkCallback = body?.Body?.stkCallback;
    console.log("STEP 3: stkCallback extracted");
    if (!stkCallback) {
      console.log("stkCallback is missing or null");
    }
    if (!stkCallback) {
      console.warn("Missing stkCallback in request body");
      // Always return 200 to acknowledge receipt
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Extract CallbackMetadata
    const callbackMetadata = stkCallback.CallbackMetadata;
    if (!callbackMetadata) {
      console.warn("Missing CallbackMetadata in stkCallback");
      // Always return 200 to acknowledge receipt
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // Extract individual fields from CallbackMetadata.Item array
    // STEP 4: Metadata extracted
    console.log("STEP 4: metadata extracted");
    const metadataItems = callbackMetadata.Item || [];
    console.log("CallbackMetadata.Item count:", metadataItems.length);
    const metadata = {};

    metadataItems.forEach((item) => {
      metadata[item.Name] = item.Value;
    });
    console.log("Parsed metadata keys:", Object.keys(metadata));

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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log("[SUPABASE CONFIG] URL exists:", !!supabaseUrl);
    console.log("[SUPABASE CONFIG] SERVICE_ROLE_KEY exists:", !!supabaseServiceRoleKey);

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing Supabase credentials");
      console.log("=== MPESA CALLBACK DEBUG END (FAILED - Missing Credentials) ===");
      // Return 200 anyway to avoid retries from M-PESA
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log("[SUPABASE] Client created successfully");

    // Save transaction to database
    if (
      amount !== undefined &&
      mpesaReceiptNumber &&
      phoneNumber &&
      transactionDate
    ) {
      console.log("[DATABASE INSERT] Attempting to save:");
      console.log("  - amount:", amount, "(type:", typeof amount + ")");
      console.log("  - mpesaReceiptNumber:", mpesaReceiptNumber);
      console.log("  - phoneNumber:", phoneNumber);
      console.log("  - transactionDate:", transactionDate);

      try {
        const insertPayload = {
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
        };

        console.log("[DATABASE INSERT] Payload prepared:", JSON.stringify(insertPayload, null, 2));

        const { error: insertError } = await supabase
          .from("mpesa_transactions")
          .insert(insertPayload);

        if (insertError) {
          console.error("INSERT FAILED");
          console.error("Full insertError object:", JSON.stringify(insertError, null, 2));
          console.error("Error code:", insertError.code);
          console.error("Error message:", insertError.message);
          console.error("Error details:", insertError.details);
          console.error("Error hint:", insertError.hint);
        } else {
          console.log("INSERT SUCCESS");
          console.log(
            `Successfully saved transaction: ${mpesaReceiptNumber} for ${phoneNumber}`
          );
        }
      } catch (dbError) {
        console.error("Database operation failed (exception):");
        console.error("Exception type:", dbError?.constructor?.name);
        console.error("Exception message:", dbError?.message);
        console.error("Full exception:", JSON.stringify(dbError, null, 2));
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
    console.log("=== MPESA CALLBACK DEBUG END (SUCCESS - Returned 200) ===");
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("mpesa-callback error (outer exception):");
    console.error("Exception type:", error?.constructor?.name);
    console.error("Exception message:", error?.message);
    console.error("Full exception:", JSON.stringify(error, null, 2));
    console.log("=== MPESA CALLBACK DEBUG END (FAILED - Exception) ===");
    // Return 200 anyway to prevent M-PESA retries on parse errors
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}