const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.MPESA_SUPABASE_URL;
const supabaseServiceKey = process.env.MPESA_SUPABASE_SERVICE_KEY;

let supabase;

// Initialize Supabase client
try {
  if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
} catch (error) {
  console.error('Failed to initialize Supabase:', error);
}

module.exports = async function handler(req, res) {
  // Log incoming request
  console.log('M-PESA callback received:', JSON.stringify(req.body, null, 2));

  try {
    // Only handle POST requests
    if (req.method !== 'POST') {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const body = req.body || {};

    // Extract stkCallback safely
    const stkCallback = body.Body?.stkCallback || {};
    const callbackMetadata = stkCallback.CallbackMetadata || {};
    const items = callbackMetadata.Item || [];

    // Extract values from Item array
    const extractValue = (items, name) => {
      const item = items.find(i => i.Name === name);
      return item ? item.Value : null;
    };

    const amount = extractValue(items, 'Amount');
    const mpesaReceiptNumber = extractValue(items, 'MpesaReceiptNumber');
    const phoneNumber = extractValue(items, 'PhoneNumber');
    const transactionDate = extractValue(items, 'TransactionDate');

    const resultCode = stkCallback.ResultCode || 0;
    const resultDescription = stkCallback.ResultDesc || 'Accepted';
    const merchantRequestId = stkCallback.MerchantRequestID || null;
    const checkoutRequestId = stkCallback.CheckoutRequestID || null;

    console.log('Extracted callback data:', {
      amount,
      mpesaReceiptNumber,
      phoneNumber,
      transactionDate,
      resultCode,
      resultDescription,
    });

    // Insert into database if Supabase is available and we have required data
    if (supabase && amount && phoneNumber) {
      try {
        const { data, error } = await supabase
          .from('mpesa_transactions')
          .insert([
            {
              amount: parseFloat(amount) || 0,
              mpesa_receipt_number: mpesaReceiptNumber || null,
              phone_number: String(phoneNumber) || null,
              transaction_date: transactionDate || null,
              result_code: resultCode || 0,
              result_description: resultDescription || null,
              merchant_request_id: merchantRequestId || null,
              checkout_request_id: checkoutRequestId || null,
              raw_callback_data: body,
            },
          ]);

        if (error) {
          console.error('Database insert error:', error);
        } else {
          console.log('Transaction inserted successfully:', data);
        }
      } catch (dbError) {
        console.error('Error inserting transaction:', dbError);
      }
    } else if (!supabase) {
      console.warn('Supabase not initialized - skipping database insert');
    } else {
      console.warn('Missing required fields for database insert:', { amount, phoneNumber });
    }

    // Always return 200 OK as per M-PESA requirements
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Unexpected error in M-PESA callback handler:', error);
    // Still return 200 to acknowledge receipt
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};