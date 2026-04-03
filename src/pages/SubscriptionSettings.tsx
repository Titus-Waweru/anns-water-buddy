import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Save, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import SubscriptionCard from "@/components/SubscriptionCard";

export default function SubscriptionSettings() {
  const { isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<any>(null);

  // Form state
  const [amount, setAmount] = useState("1000");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [gracePeriod, setGracePeriod] = useState("7");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [purpose, setPurpose] = useState("DATABASE RENEWALS");

  useEffect(() => {
    loadRecord();
  }, []);

  const loadRecord = async () => {
    const { data } = await supabase
      .from("subscription_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const r = data as any;
      setRecord(r);
      setAmount(String(r.amount));
      setBillingCycle(r.billing_cycle || "monthly");
      setGracePeriod(String(r.grace_period_days));
      setPurpose(r.purpose || "DATABASE RENEWALS");
      if (r.next_due_date) {
        setStartDate(format(new Date(r.next_due_date), "yyyy-MM-dd"));
      }
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const nextDue = new Date(startDate);
    const payload = {
      amount: Number(amount),
      billing_cycle: billingCycle,
      grace_period_days: Number(gracePeriod),
      purpose,
      next_due_date: nextDue.toISOString(),
      updated_at: new Date().toISOString(),
    };

    let error;
    if (record) {
      ({ error } = await supabase.from("subscription_records").update(payload as any).eq("id", record.id));
    } else {
      ({ error } = await supabase.from("subscription_records").insert({ ...payload, status: "active" } as any));
    }

    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success("Subscription settings saved");
      await loadRecord();
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!record) return;
    const now = new Date();
    const nextDue = addMonths(now, 1);
    const { error } = await supabase.from("subscription_records").update({
      last_payment_date: now.toISOString(),
      next_due_date: nextDue.toISOString(),
      status: "active",
      payment_reference: "MANUAL-RESET-" + Date.now(),
      updated_at: now.toISOString(),
    } as any).eq("id", record.id);

    if (error) {
      toast.error("Failed to reset");
    } else {
      toast.success("Subscription reset to active");
      await loadRecord();
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Only superadmin can access subscription settings.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Subscription Management</h1>
          <p className="text-sm text-muted-foreground">Configure billing, grace periods, and payment tracking</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Billing Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Purpose Label</Label>
              <Input value={purpose} onChange={e => setPurpose(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subscription Amount (KES)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" />
            </div>
            <div className="space-y-2">
              <Label>Billing Cycle</Label>
              <Select value={billingCycle} onValueChange={setBillingCycle}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Grace Period (Days)</Label>
              <Input type="number" value={gracePeriod} onChange={e => setGracePeriod(e.target.value)} min="1" max="30" />
            </div>
            <div className="space-y-2">
              <Label>Next Due Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {record ? "Update Settings" : "Create Subscription"}
              </Button>
              {record && (
                <Button variant="outline" onClick={handleReset} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <SubscriptionCard />
        </div>
      </div>
    </div>
  );
}
