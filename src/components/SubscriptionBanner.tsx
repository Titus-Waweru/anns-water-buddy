import { useState, useEffect } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";

export default function SubscriptionBanner() {
  const { status, daysRemaining, loading, record } = useSubscription();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "subscription_notifications_enabled")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setNotificationsEnabled(data.setting_value === "true");
      });
  }, []);

  if (loading || !record || status === "active" || !notificationsEnabled) return null;

  if (status === "warning") {
    return (
      <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2.5 flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          ⚠️ Your subscription is due in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. Please renew to avoid service interruption.
        </span>
      </div>
    );
  }

  if (status === "grace") {
    return (
      <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2.5 flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
        <Clock className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          ⚠️ Subscription expired. System is in GRACE MODE — {record.grace_period_days + (daysRemaining ?? 0)} days remaining. Some features may be restricted.
        </span>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 flex items-center gap-2 text-sm text-destructive font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>🚫 Subscription expired. Sales, inventory, and production features are locked. Contact superadmin to renew.</span>
      </div>
    );
  }

  return null;
}
