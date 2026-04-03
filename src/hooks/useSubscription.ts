import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, addMonths, addDays } from "date-fns";

export interface SubscriptionRecord {
  id: string;
  amount: number;
  purpose: string;
  last_payment_date: string | null;
  next_due_date: string;
  status: string;
  payment_reference: string | null;
  grace_period_days: number;
  billing_cycle: string;
  created_at: string;
  updated_at: string;
}

export type SubStatus = "active" | "warning" | "grace" | "expired" | "none";

export function useSubscription() {
  const [record, setRecord] = useState<SubscriptionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SubStatus>("none");
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  const fetchSubscription = useCallback(async () => {
    const { data } = await supabase
      .from("subscription_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const rec = data as unknown as SubscriptionRecord;
      setRecord(rec);

      const now = new Date();
      const due = new Date(rec.next_due_date);
      const diff = differenceInDays(due, now);
      setDaysRemaining(diff);

      if (diff > 7) {
        setStatus("active");
      } else if (diff > 0) {
        setStatus("warning");
      } else if (Math.abs(diff) <= rec.grace_period_days) {
        setStatus("grace");
      } else {
        setStatus("expired");
      }
    } else {
      setRecord(null);
      setStatus("none");
      setDaysRemaining(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const recordPayment = async (paymentRef: string) => {
    if (!record) return;
    const now = new Date();
    const nextDue = addMonths(now, 1);

    const { error } = await supabase
      .from("subscription_records")
      .update({
        last_payment_date: now.toISOString(),
        next_due_date: nextDue.toISOString(),
        status: "active",
        payment_reference: paymentRef,
        updated_at: now.toISOString(),
      } as any)
      .eq("id", record.id);

    if (!error) await fetchSubscription();
    return error;
  };

  const isFeatureLocked = status === "expired";

  return { record, loading, status, daysRemaining, isFeatureLocked, recordPayment, refetch: fetchSubscription };
}
