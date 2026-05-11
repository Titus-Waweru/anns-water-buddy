import { createClient } from '@supabase/supabase-js';

let supabase = null;
try {
  const url = process.env.MPESA_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.MPESA_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) supabase = createClient(url, key);
} catch (e) {
  console.error('Supabase init failed:', e);
}

export default async function handler(req, res) {
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    if (req.method !== 'POST') return ack();
    const body = req.body || {};
    console.log('Callback received:', JSON.stringify(body));

    let messageReference = null, resultCode = null, resultDesc = null;
    let amount = null, phone = null, transactionDate = null, receipt = null;

    const coop = body?.Data || body;
    if (coop?.MessageReference) {
      messageReference = String(coop.MessageReference);
      resultCode = coop.ResultCode ?? coop.StatusCode ?? null;
      resultDesc = coop.ResultDesc ?? coop.StatusDescription ?? null;
      amount = coop.Amount != null ? Number(coop.Amount) : null;
      phone = coop.MSISDN ? String(coop.MSISDN) : null;
      transactionDate = coop.MessageDateTime || coop.TransactionDate || null;
      receipt = coop.TransactionID || coop.ThirdPartyTransID || null;
    }

    const stk = body?.Body?.stkCallback;
    if (!messageReference && stk) {
      resultCode = stk.ResultCode ?? null;
      resultDesc = stk.ResultDesc ?? null;
      messageReference = stk.MerchantRequestID || stk.CheckoutRequestID || null;
      const items = stk.CallbackMetadata?.Item || [];
      const get = (n) => items.find((i) => i.Name === n)?.Value;
      amount = get('Amount') != null ? Number(get('Amount')) : null;
      phone = get('PhoneNumber') ? String(get('PhoneNumber')) : null;
      receipt = get('MpesaReceiptNumber') ? String(get('MpesaReceiptNumber')) : null;
      const td = get('TransactionDate');
      if (td) {
        const s = String(td);
        transactionDate = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
      }
    }

    if (!messageReference || !supabase) return ack();

    const isSuccess = String(resultCode) === '0';
    const status = isSuccess ? 'SUCCESS' : 'FAILED';

    const { data: payment } = await supabase
      .from('payments')
      .select('id, sale_id, status')
      .eq('message_reference', messageReference)
      .maybeSingle();

    if (!payment || payment.status === 'SUCCESS') return ack();

    await supabase.from('payments').update({
      status,
      result_code: resultCode != null ? String(resultCode) : null,
      result_description: resultDesc,
      transaction_date: transactionDate ? new Date(transactionDate).toISOString() : new Date().toISOString(),
      raw_payload: body,
      ...(amount != null ? { amount } : {}),
      ...(phone ? { phone_number: phone } : {}),
      ...(receipt ? { narration: `Receipt ${receipt}` } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id);

    if (payment.sale_id) {
      await supabase.from('sales')
        .update({ payment_status: isSuccess ? 'PAID' : 'FAILED' })
        .eq('id', payment.sale_id);
    }

    return ack();
  } catch (err) {
    console.error('Callback error:', err);
    return ack();
  }
}
