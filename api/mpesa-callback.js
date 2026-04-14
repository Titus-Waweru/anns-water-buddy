import { createClient } from '@supabase/supabase-js';

// Initialize Supabase safely
let supabase = null;

try {
  const supabaseUrl = process.env.MPESA_SUPABASE_URL;
  const supabaseServiceKey = process.env.MPESA_SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseServiceKey) {
    supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
} catch (error) {
  console.error('❌ Failed to initialize Supabase:', error);
}

export default async function handler(req, res) {
  console.log('🔥 M-PESA CALLBACK RECEIVED');
  console.log('METHOD:', req.method);
  console.log('BODY:', JSON.stringify(req.body, null, 2));

  try {
    if (req.method !== 'POST') {
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Accepted',
      });
    }

    const body = req.body || {};

    const stkCallback = body?.Body?.stkCallback;

    if (!stkCallback) {
      console.log('⚠️ No stkCallback found');
      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Accepted',
      });
    }

    const items = stkCallback.CallbackMetadata?.Item || [];

    const getValue = (name) => {
      const item = items.find((i) => i.Name === name);
      return item ? item.Value : null;
    };

    const amount = getValue('Amount');
    const mpesaReceiptNumber = getValue('MpesaReceiptNumber');
    const phoneNumber = getValue('PhoneNumber');
    const transactionDate = getValue('TransactionDate');

    const resultCode = stkCallback.ResultCode ?? 0;
    const resultDescription = stkCallback.ResultDesc ?? 'Accepted';
    const merchantRequestId = stkCallback.MerchantRequestID ?? null;
    const checkoutRequestId = stkCallback.CheckoutRequestID ?? null;

    console.log('📦 Extracted Data:', {
      amount,
      mpesaReceiptNumber,
      phoneNumber,
      transactionDate,
      resultCode,
      resultDescription,
    });

    // 🧠 FIXED DATE HANDLING (IMPORTANT)
    const safeTransactionDate = transactionDate
      ? new Date(
          transactionDate.substring(0, 4) + '-' +
          transactionDate.substring(4, 6) + '-' +
          transactionDate.substring(6, 8) + 'T' +
          transactionDate.substring(8, 10) + ':' +
          transactionDate.substring(10, 12) + ':' +
          transactionDate.substring(12, 14)
        ).toISOString()
      : new Date().toISOString();

    // Save to Supabase
    if (supabase && amount && phoneNumber) {
      const { error } = await supabase.from('mpesa_transactions').insert([
        {
          amount: Number(amount) || 0,
          mpesa_receipt_number: mpesaReceiptNumber,
          phone_number: String(phoneNumber),

          // ✅ FIXED LINE
          transaction_date: safeTransactionDate,

          result_code: resultCode,
          result_description: resultDescription,
          merchant_request_id: merchantRequestId,
          checkout_request_id: checkoutRequestId,
          raw_callback_data: body,
        },
      ]);

      if (error) {
        console.error('❌ Supabase insert error:', error);
      } else {
        console.log('✅ Transaction saved successfully');
      }
    } else {
      console.warn('⚠️ Skipping DB insert (missing data or Supabase not ready)');
    }

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });

  } catch (error) {
    console.error('❌ Callback error:', error);

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: 'Accepted',
    });
  }
}