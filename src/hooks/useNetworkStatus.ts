import { useState, useEffect, useCallback } from "react";

export type NetworkState = "online" | "offline" | "syncing";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState<NetworkState>(navigator.onLine ? "online" : "offline");

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      setSyncState("online");
    };
    const goOffline = () => {
      setIsOnline(false);
      setSyncState("offline");
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const setSyncing = useCallback(() => setSyncState("syncing"), []);
  const setSynced = useCallback(() => setSyncState("online"), []);

  return { isOnline, syncState, setSyncing, setSynced };
}
