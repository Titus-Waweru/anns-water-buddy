import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Trash2, Loader2, ShieldAlert, Timer, Eye, EyeOff, Settings, Lock, CreditCard } from "lucide-react";
import { toast } from "sonner";

const RESET_TARGETS = [
  { key: "sales", label: "Sales Records", table: "sales" },
  { key: "inventory_logs", label: "Inventory Logs", table: "inventory_logs" },
  { key: "customers", label: "Customers", table: "customers" },
  { key: "purchases", label: "Purchase Records", table: "purchases" },
  { key: "cash_submissions", label: "Cash Submissions", table: "cash_submissions" },
  { key: "vouchers", label: "Vouchers", table: "vouchers" },
  { key: "stock_adjustments", label: "Stock Adjustments", table: "stock_adjustments" },
  { key: "production_records", label: "Production Records", table: "production_records" },
] as const;

export default function SystemControl() {
  const { isSuperAdmin, user } = useAuth();
  const [selectedTarget, setSelectedTarget] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  // M-Pesa credentials
  const [mpesaFields, setMpesaFields] = useState({ consumer_key: "", consumer_secret: "", shortcode: "", passkey: "" });
  const [mpesaVisible, setMpesaVisible] = useState<Record<string, boolean>>({});
  const [mpesaSaving, setMpesaSaving] = useState(false);

  // Paystack
  const [paystackKey, setPaystackKey] = useState("");
  const [paystackVisible, setPaystackVisible] = useState(false);
  const [paystackSaving, setPaystackSaving] = useState(false);

  // Countdown
  const [countdownDays, setCountdownDays] = useState(0);
  const [currentCountdown, setCurrentCountdown] = useState<{ end_date: string; remaining: number } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;
    // Load M-Pesa settings
    supabase.from("system_settings").select("*").in("setting_key", [
      "mpesa_consumer_key", "mpesa_consumer_secret", "mpesa_shortcode", "mpesa_passkey",
      "system_countdown_end", "paystack_public_key",
    ]).then(({ data }) => {
      const vals: Record<string, string> = {};
      data?.forEach(s => { vals[s.setting_key] = s.setting_value; });
      setMpesaFields({
        consumer_key: vals.mpesa_consumer_key || "",
        consumer_secret: vals.mpesa_consumer_secret || "",
        shortcode: vals.mpesa_shortcode || "",
        passkey: vals.mpesa_passkey || "",
      });
      if (vals.system_countdown_end) {
        const end = new Date(vals.system_countdown_end);
        const remaining = Math.max(0, Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        setCurrentCountdown({ end_date: vals.system_countdown_end, remaining });
      }
      setPaystackKey(vals.paystack_public_key || "");
    });
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <ShieldAlert className="h-12 w-12 mx-auto mb-3 text-destructive" />
        <p className="font-semibold">Access Denied</p>
        <p className="text-sm">Only Superadmin can access System Control.</p>
      </div>
    );
  }

  const handleReset = async () => {
    if (confirmText !== "RESET" || !selectedTarget) { toast.error('Type "RESET" and select a target'); return; }
    const target = RESET_TARGETS.find(t => t.key === selectedTarget);
    if (!target) return;
    setLoading(true);
    const { error } = await supabase.from(target.table as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error(`Failed: ${error.message}`);
    else toast.success(`${target.label} reset successfully`);
    setConfirmText(""); setSelectedTarget(""); setLoading(false);
  };

  const saveMpesa = async () => {
    setMpesaSaving(true);
    const entries = [
      { key: "mpesa_consumer_key", val: mpesaFields.consumer_key },
      { key: "mpesa_consumer_secret", val: mpesaFields.consumer_secret },
      { key: "mpesa_shortcode", val: mpesaFields.shortcode },
      { key: "mpesa_passkey", val: mpesaFields.passkey },
    ];
    for (const { key, val } of entries) {
      const { data } = await supabase.from("system_settings").select("id").eq("setting_key", key).maybeSingle();
      if (data) {
        await supabase.from("system_settings").update({ setting_value: val, is_encrypted: true, updated_by: user!.id }).eq("setting_key", key);
      } else {
        await supabase.from("system_settings").insert({ setting_key: key, setting_value: val, is_encrypted: true, updated_by: user!.id });
      }
    }
    toast.success("M-Pesa credentials saved securely");
    setMpesaSaving(false);
  };

  const saveCountdown = async () => {
    if (countdownDays <= 0) { toast.error("Enter valid number of days"); return; }
    const endDate = new Date(Date.now() + countdownDays * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("system_settings").select("id").eq("setting_key", "system_countdown_end").maybeSingle();
    if (data) {
      await supabase.from("system_settings").update({ setting_value: endDate, updated_by: user!.id }).eq("setting_key", "system_countdown_end");
    } else {
      await supabase.from("system_settings").insert({ setting_key: "system_countdown_end", setting_value: endDate, updated_by: user!.id });
    }
    const remaining = Math.ceil(countdownDays);
    setCurrentCountdown({ end_date: endDate, remaining });
    toast.success(`System countdown set to ${countdownDays} days`);
    setCountdownDays(0);
  };

  const clearCountdown = async () => {
    await supabase.from("system_settings").delete().eq("setting_key", "system_countdown_end");
    setCurrentCountdown(null);
    toast.success("Countdown cleared");
  };

  const maskValue = (val: string) => val ? "•".repeat(Math.min(val.length, 20)) : "";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-destructive" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Control</h1>
          <p className="text-sm text-muted-foreground">Superadmin-only system management</p>
        </div>
      </div>

      <Tabs defaultValue="paystack" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="paystack"><CreditCard className="h-3 w-3 mr-1" /> Paystack</TabsTrigger>
          <TabsTrigger value="mpesa"><Lock className="h-3 w-3 mr-1" /> M-Pesa</TabsTrigger>
          <TabsTrigger value="countdown"><Timer className="h-3 w-3 mr-1" /> Countdown</TabsTrigger>
          <TabsTrigger value="reset"><Trash2 className="h-3 w-3 mr-1" /> Reset</TabsTrigger>
        </TabsList>

        {/* Paystack Public Key */}
        <TabsContent value="paystack">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5" /> Paystack Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Set your Paystack public key for subscription payments. Get it from your <span className="font-medium text-foreground">Paystack Dashboard → Settings → API Keys</span>.</p>
              <div>
                <Label>Public Key</Label>
                <div className="flex gap-2">
                  <Input
                    type={paystackVisible ? "text" : "password"}
                    value={paystackKey}
                    onChange={e => setPaystackKey(e.target.value)}
                    placeholder="pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="font-mono text-xs"
                  />
                  <Button variant="ghost" size="icon" onClick={() => setPaystackVisible(p => !p)}>
                    {paystackVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button onClick={async () => {
                setPaystackSaving(true);
                const { data } = await supabase.from("system_settings").select("id").eq("setting_key", "paystack_public_key").maybeSingle();
                if (data) {
                  await supabase.from("system_settings").update({ setting_value: paystackKey, updated_by: user!.id }).eq("setting_key", "paystack_public_key");
                } else {
                  await supabase.from("system_settings").insert({ setting_key: "paystack_public_key", setting_value: paystackKey, updated_by: user!.id });
                }
                toast.success("Paystack public key saved");
                setPaystackSaving(false);
              }} disabled={paystackSaving || !paystackKey} className="w-full">
                {paystackSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Paystack Key
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* M-Pesa Credentials */}
        <TabsContent value="mpesa">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Settings className="h-5 w-5" /> M-Pesa Daraja Credentials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Securely stored. Only you can view or update these.</p>
              {(["consumer_key", "consumer_secret", "shortcode", "passkey"] as const).map(field => (
                <div key={field}>
                  <Label className="capitalize">{field.replace("_", " ")}</Label>
                  <div className="flex gap-2">
                    <Input
                      type={mpesaVisible[field] ? "text" : "password"}
                      value={mpesaFields[field]}
                      onChange={e => setMpesaFields(p => ({ ...p, [field]: e.target.value }))}
                      placeholder={`Enter ${field.replace("_", " ")}...`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setMpesaVisible(p => ({ ...p, [field]: !p[field] }))}>
                      {mpesaVisible[field] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
              <Button onClick={saveMpesa} disabled={mpesaSaving} className="w-full">
                {mpesaSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save M-Pesa Credentials
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Countdown */}
        <TabsContent value="countdown">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Timer className="h-5 w-5" /> System Countdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentCountdown && (
                <div className={`p-4 rounded-lg border ${currentCountdown.remaining <= 3 ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/30"}`}>
                  <p className="text-sm font-semibold text-foreground">Active Countdown</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{currentCountdown.remaining} days remaining</p>
                  <p className="text-xs text-muted-foreground mt-1">Expires: {format(new Date(currentCountdown.end_date), "dd MMM yyyy")}</p>
                  {currentCountdown.remaining <= 3 && (
                    <p className="text-xs text-destructive mt-2 font-semibold">⚠️ Approaching expiry — system restrictions will activate at 0</p>
                  )}
                  <Button variant="outline" size="sm" className="mt-3" onClick={clearCountdown}>Clear Countdown</Button>
                </div>
              )}
              <div>
                <Label>Set Countdown (days)</Label>
                <Input type="number" min={1} value={countdownDays || ""} onChange={e => setCountdownDays(Number(e.target.value))} placeholder="e.g. 14" />
              </div>
              <Button onClick={saveCountdown} className="w-full">Set Countdown</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Reset */}
        <TabsContent value="reset">
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Data Reset — Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
                <p className="font-semibold">⚠️ Warning: This action is irreversible!</p>
              </div>
              <div>
                <Label>Select Data to Reset</Label>
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger><SelectValue placeholder="Choose data type..." /></SelectTrigger>
                  <SelectContent>
                    {RESET_TARGETS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type "RESET" to confirm</Label>
                <Input value={confirmText} onChange={e => setConfirmText(e.target.value.toUpperCase())} placeholder='Type "RESET"...' className="font-mono" />
              </div>
              <Button variant="destructive" className="w-full gap-2" disabled={confirmText !== "RESET" || !selectedTarget || loading} onClick={handleReset}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Reset {RESET_TARGETS.find(t => t.key === selectedTarget)?.label || "Selected Data"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
