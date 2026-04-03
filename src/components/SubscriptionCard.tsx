import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Shield, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { useSubscription, SubStatus } from "@/hooks/useSubscription";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const STATUS_CONFIG: Record<SubStatus, { label: string; color: string; icon: any; bg: string }> = {
  active: { label: "Active", color: "text-green-700 dark:text-green-400", icon: CheckCircle, bg: "bg-green-500/10 border-green-500/30" },
  warning: { label: "Warning", color: "text-yellow-700 dark:text-yellow-400", icon: AlertTriangle, bg: "bg-yellow-500/10 border-yellow-500/30" },
  grace: { label: "Grace Period", color: "text-orange-700 dark:text-orange-400", icon: Clock, bg: "bg-orange-500/10 border-orange-500/30" },
  expired: { label: "Expired", color: "text-red-700 dark:text-red-400", icon: AlertTriangle, bg: "bg-red-500/10 border-red-500/30" },
  none: { label: "No Subscription", color: "text-muted-foreground", icon: Shield, bg: "bg-muted border-border" },
};

export default function SubscriptionCard() {
  const { record, status, daysRemaining, loading, recordPayment } = useSubscription();
  const { isAdmin, isSuperAdmin } = useAuth();

  if (loading || !record) return null;

  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  const handlePay = () => {
    // Paystack inline integration
    const w = window as any;
    if (!w.PaystackPop) {
      toast.error("Payment service loading. Please try again.");
      return;
    }
    const handler = w.PaystackPop.setup({
      key: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", // placeholder - superadmin sets real key via system settings
      email: "billing@wonderaqua.com",
      amount: (record.amount || 1000) * 100, // Paystack uses kobo/cents
      currency: "KES",
      ref: `WA-SUB-${Date.now()}`,
      callback: async (response: any) => {
        const err = await recordPayment(response.reference);
        if (err) {
          toast.error("Failed to update subscription record");
        } else {
          toast.success("✅ Subscription Paid Successfully!");
        }
      },
      onClose: () => {
        toast.info("Payment cancelled");
      },
    });
    handler.openIframe();
  };

  return (
    <Card className={`border ${cfg.bg} transition-all`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Subscription Status
          </CardTitle>
          <Badge className={`${cfg.color} border text-[10px] font-bold uppercase tracking-wider`} variant="outline">
            <StatusIcon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Purpose</p>
            <p className="font-semibold text-foreground">{record.purpose}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Amount</p>
            <p className="font-semibold text-foreground">KES {Number(record.amount).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Payment</p>
            <p className="font-medium text-foreground">
              {record.last_payment_date ? format(new Date(record.last_payment_date), "MMM dd, yyyy") : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Next Renewal</p>
            <p className="font-medium text-foreground">{format(new Date(record.next_due_date), "MMM dd, yyyy")}</p>
          </div>
        </div>

        {daysRemaining !== null && (
          <div className={`text-center py-2 rounded-lg text-xs font-bold ${
            status === "active" ? "bg-green-500/10 text-green-700 dark:text-green-400"
            : status === "warning" ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            : status === "grace" ? "bg-orange-500/10 text-orange-700 dark:text-orange-400"
            : "bg-red-500/10 text-red-700 dark:text-red-400"
          }`}>
            {daysRemaining > 0
              ? `${daysRemaining} days remaining`
              : daysRemaining === 0
                ? "Due today"
                : `${Math.abs(daysRemaining)} days overdue`}
          </div>
        )}

        {record.payment_reference && (
          <p className="text-[10px] text-muted-foreground">Ref: {record.payment_reference}</p>
        )}

        {isAdmin && (status === "warning" || status === "grace" || status === "expired") && (
          <Button onClick={handlePay} className="w-full gap-2" size="sm">
            <CreditCard className="h-4 w-4" />
            Pay Subscription — KES {Number(record.amount).toLocaleString()}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
