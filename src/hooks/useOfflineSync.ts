import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUnsyncedActions, markSynced, getQueueCount, clearSyncedActions } from "@/lib/offlineDb";
import { useNetworkStatus, type NetworkState } from "./useNetworkStatus";
import { toast } from "sonner";

export function useOfflineSync(onSyncComplete?: () => void) {
  const { isOnline, syncState, setSyncing, setSynced } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  const updateCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  const syncAll = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setSyncing();

    try {
      const actions = await getUnsyncedActions();
      if (actions.length === 0) {
        setSynced();
        syncingRef.current = false;
        return;
      }

      let syncedCount = 0;
      for (const action of actions) {
        try {
          const { _offline_id, ...cleanPayload } = action.payload as Record<string, unknown>;
          const { error } = await supabase.from(action.table as any).insert(cleanPayload as any);
          if (!error) {
            await markSynced(action.id);
            syncedCount++;
          } else {
            console.error(`Sync error for ${action.table}:`, error);
          }
        } catch (err) {
          console.error("Sync item error:", err);
        }
      }

      if (syncedCount > 0) {
        toast.success(`${syncedCount} offline record${syncedCount > 1 ? "s" : ""} synced successfully`);
        await clearSyncedActions();
        onSyncComplete?.();
      }
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSynced();
      syncingRef.current = false;
      await updateCount();
    }
  }, [setSyncing, setSynced, onSyncComplete, updateCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncAll();
    }
  }, [isOnline, syncAll]);

  // Periodic count refresh
  useEffect(() => {
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, [updateCount]);

  return { isOnline, syncState, pendingCount, syncAll, updateCount };
}
