import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Trash2, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

const RESET_TARGETS = [
  { key: "sales", label: "Sales Records", table: "sales" },
  { key: "inventory_logs", label: "Inventory Logs", table: "inventory_logs" },
  { key: "customers", label: "Customers", table: "customers" },
  { key: "purchases", label: "Purchase Records", table: "purchases" },
  { key: "cash_submissions", label: "Cash Submissions", table: "cash_submissions" },
  { key: "vouchers", label: "Vouchers", table: "vouchers" },
  { key: "stock_adjustments", label: "Stock Adjustments", table: "stock_adjustments" },
] as const;

export default function SystemControl() {
  const { isSuperAdmin } = useAuth();
  const [selectedTarget, setSelectedTarget] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (confirmText !== "RESET") {
      toast.error('Please type "RESET" to confirm');
      return;
    }
    if (!selectedTarget) {
      toast.error("Select a data target to reset");
      return;
    }

    const target = RESET_TARGETS.find(t => t.key === selectedTarget);
    if (!target) return;

    setLoading(true);
    const { error } = await supabase.from(target.table as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    
    if (error) {
      toast.error(`Failed to reset ${target.label}: ${error.message}`);
    } else {
      toast.success(`${target.label} have been reset successfully`);
    }
    
    setConfirmText("");
    setSelectedTarget("");
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-destructive" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Control</h1>
          <p className="text-sm text-muted-foreground">Superadmin-only system management tools</p>
        </div>
      </div>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Data Reset — Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
            <p className="font-semibold">⚠️ Warning: This action is irreversible!</p>
            <p className="mt-1">Resetting data will permanently delete all records of the selected type. This cannot be undone.</p>
          </div>

          <div>
            <Label>Select Data to Reset</Label>
            <Select value={selectedTarget} onValueChange={setSelectedTarget}>
              <SelectTrigger><SelectValue placeholder="Choose data type..." /></SelectTrigger>
              <SelectContent>
                {RESET_TARGETS.map(t => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Type "RESET" to confirm</Label>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value.toUpperCase())}
              placeholder='Type "RESET" here...'
              className="font-mono"
            />
          </div>

          <Button
            variant="destructive"
            className="w-full gap-2"
            disabled={confirmText !== "RESET" || !selectedTarget || loading}
            onClick={handleReset}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Reset {RESET_TARGETS.find(t => t.key === selectedTarget)?.label || "Selected Data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
