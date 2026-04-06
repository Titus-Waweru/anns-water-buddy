import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import type { NetworkState } from "@/hooks/useNetworkStatus";

interface Props {
  syncState: NetworkState;
  pendingCount: number;
}

export default function NetworkStatusIndicator({ syncState, pendingCount }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      {syncState === "online" && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-success px-2 py-0.5 rounded-full bg-success/10">
          <Wifi className="h-3 w-3" />
          <span className="hidden sm:inline">ONLINE</span>
        </div>
      )}
      {syncState === "offline" && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-destructive px-2 py-0.5 rounded-full bg-destructive/10">
          <WifiOff className="h-3 w-3" />
          <span className="hidden sm:inline">OFFLINE</span>
          {pendingCount > 0 && (
            <span className="bg-destructive text-destructive-foreground text-[9px] px-1.5 py-0.5 rounded-full ml-0.5">
              {pendingCount}
            </span>
          )}
        </div>
      )}
      {syncState === "syncing" && (
        <div className="flex items-center gap-1 text-[10px] font-medium text-warning px-2 py-0.5 rounded-full bg-warning/10">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span className="hidden sm:inline">SYNCING</span>
        </div>
      )}
    </div>
  );
}
