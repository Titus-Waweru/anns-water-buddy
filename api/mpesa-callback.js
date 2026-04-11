import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Parse request body
    const body = req.body;
    console.log("Received M-PESA callback:", JSON.stringify(body, null, 2));

    // Extract stkCallback from body
    const stkCallback = body?.Body?.stkCallback;
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
    const metadataItems = callbackMetadata.Item || [];
    const metadata = {};

    metadataItems.forEach((item) => {
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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Missing Supabase credentials");
      // Return 200 anyway to avoid retries from M-PESA
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
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
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("mpesa-callback error:", error);
    // Return 200 anyway to prevent M-PESA retries on parse errors
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}