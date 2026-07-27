import { createClient } from '@supabase/supabase-js';

export async function finalizePaymentCompletion({ supabase, saleId, paymentStatus }) {
  if (!saleId || !supabase) return null;

  const { data: sale, error } = await supabase
    .from('sales')
    .select('*')
    .eq('id', saleId)
    .maybeSingle();

  if (error || !sale) {
    throw error || new Error('Sale not found');
  }

  if (sale.payment_status === paymentStatus) {
    return sale;
  }

  if (paymentStatus === 'PAID') {
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', saleId);

    if (saleItems && saleItems.length > 0) {
      for (const item of saleItems) {
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('id', item.product_id)
          .maybeSingle();

        if (product) {
          await supabase
            .from('products')
            .update({ quantity: Math.max(0, Number(product.quantity) - Number(item.quantity)) })
            .eq('id', item.product_id);
        }

        await supabase.from('inventory_logs').insert({
          product_id: item.product_id,
          product_name: item.product_name,
          type: 'OUT',
          quantity: item.quantity,
          reference: `Sale to ${sale.customer_name || 'Walk-in'}`,
          date: sale.date || new Date().toISOString(),
          branch_id: sale.branch_id,
        });
      }
    } else {
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', sale.product_id)
        .maybeSingle();

      if (product) {
        await supabase
          .from('products')
          .update({ quantity: Math.max(0, Number(product.quantity) - Number(sale.quantity)) })
          .eq('id', sale.product_id);
      }

      await supabase.from('inventory_logs').insert({
        product_id: sale.product_id,
        product_name: sale.product_name,
        type: 'OUT',
        quantity: sale.quantity,
        reference: `Sale to ${sale.customer_name || 'Walk-in'}`,
        date: sale.date || new Date().toISOString(),
        branch_id: sale.branch_id,
      });
    }

    if (sale.payment_mode === 'Credit' && sale.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', sale.customer_id)
        .maybeSingle();

      if (customer) {
        await supabase
          .from('customers')
          .update({ credit_balance: Number(customer.credit_balance) + Number(sale.final_amount) })
          .eq('id', sale.customer_id);
      }
    }
  }

  await supabase
    .from('sales')
    .update({ payment_status: paymentStatus })
    .eq('id', saleId);

  return sale;
}
