import { createClient } from '@supabase/supabase-js';
import { finalizePaymentCompletion } from './lib/payment-finalizer.js';

let supabase = null;
try {
  const url = process.env.MPESA_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.MPESA_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) supabase = createClient(url, key);
} catch (e) {
  console.error('Supabase init failed:', e);
}

export default async function handler(req, res) {
  const ok = (payload) => res.status(200).json({ ok: true, ...payload });
  const fail = (status, message) => res.status(status).json({ ok: false, error: message });

  if (req.method !== 'POST') return fail(405, 'Method not allowed');
  if (!supabase) return fail(500, 'Supabase service client not configured');

  const body = req.body || {};
  const {
    sale_id,
    message_reference,
    mpesa_receipt,
    phone_number,
    amount,
    payment_time,
    transaction_date,
    branch_id,
    entered_by,
    notes,
    narration,
  } = body;

  if (!message_reference) return fail(400, 'message_reference is required');
  if (!sale_id) return fail(400, 'sale_id is required');

  const payload = {
    status: 'SUCCESS',
    payment_method: 'MPESA_MANUAL',
    payment_source: 'Manual Entry',
    mpesa_receipt: mpesa_receipt || null,
    payment_time: payment_time || null,
    transaction_date: transaction_date || payment_time || null,
    phone_number: phone_number || null,
    amount: amount != null ? Number(amount) : null,
    notes: notes || null,
    entered_by: entered_by || null,
    result_code: '0',
    result_description: 'Manual M-Pesa entry',
    updated_at: new Date().toISOString(),
  };

  try {
    const { data: existing, error: selectError } = await supabase
      .from('payments')
      .select('id')
      .eq('message_reference', message_reference)
      .maybeSingle();

    if (selectError) {
      console.error('mpesa-manual-entry select error', selectError);
      return fail(500, 'Failed to locate existing payment');
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('payments')
        .update(payload)
        .eq('id', existing.id);
      if (updateError) {
        console.error('mpesa-manual-entry update error', updateError);
        return fail(500, 'Could not update payment');
      }
    } else {
      const insertRow = {
        provider: 'coop',
        sale_id,
        message_reference,
        transaction_currency: 'KES',
        initiated_by: entered_by || null,
        branch_id: branch_id || null,
        narration: narration || `Manual M-Pesa ${mpesa_receipt || 'payment'}`,
        ...payload,
      };
      const { error: insertError } = await supabase.from('payments').insert(insertRow);
      if (insertError) {
        console.error('mpesa-manual-entry insert error', insertError);
        if (insertError.code === '23505') {
          return fail(409, 'That M-Pesa transaction code has already been recorded.');
        }
        return fail(500, 'Could not create payment');
      }
    }

    try {
      await finalizePaymentCompletion({ supabase, saleId: sale_id, paymentStatus: 'PAID' });
    } catch (finalizeError) {
      console.error('mpesa-manual-entry finalize error', finalizeError);
      return fail(500, 'Could not finalize sale');
    }
    return ok();
  } catch (err) {
    console.error('mpesa-manual-entry unexpected error', err);
    return fail(500, 'Unexpected server error');
  }
}
