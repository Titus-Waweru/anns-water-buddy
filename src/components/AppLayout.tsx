import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building, FileText, BarChart3, Menu, X, LogOut,
  DollarSign, Wrench, Receipt, Factory, Target, ShieldAlert, Timer, AlertTriangle, GitBranch,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useData } from "@/context/DataContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ThemeToggle from "@/components/ThemeToggle";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import logo from "@/assets/logo.jpg";

interface NavItem {
  title: string;
  path: string;
  icon: any;
  roles: string[];
}

const allNavItems: NavItem[] = [
  { title: "Dashboard", path: "/app", icon: LayoutDashboard, roles: [] },
  { title: "Inventory", path: "/app/inventory", icon: Package, roles: [] },
  { title: "Sales", path: "/app/sales", icon: ShoppingCart, roles: ["superadmin", "supervisor", "cashier"] },
  { title: "Purchases", path: "/app/purchases", icon: Truck, roles: ["superadmin", "supervisor"] },
  { title: "Customers", path: "/app/customers", icon: Users, roles: ["superadmin", "supervisor", "cashier"] },
  { title: "Suppliers", path: "/app/suppliers", icon: Building, roles: ["superadmin", "supervisor"] },
  { title: "Transactions", path: "/app/transactions", icon: FileText, roles: ["superadmin", "supervisor"] },
  { title: "Reports", path: "/app/reports", icon: BarChart3, roles: ["superadmin", "supervisor"] },
  { title: "Cash Submission", path: "/app/cash-submission", icon: DollarSign, roles: ["superadmin", "supervisor", "cashier"] },
  { title: "Production", path: "/app/production", icon: Factory, roles: ["superadmin", "supervisor", "stock_manager"] },
  { title: "Targets", path: "/app/targets", icon: Target, roles: ["superadmin", "supervisor"] },
  { title: "Assets", path: "/app/assets", icon: Wrench, roles: ["superadmin", "supervisor"] },
  { title: "Vouchers", path: "/app/vouchers", icon: Receipt, roles: ["superadmin", "supervisor"] },
  { title: "Teams", path: "/app/teams", icon: Users, roles: ["superadmin", "supervisor"] },
  { title: "Branches", path: "/app/branches", icon: Building, roles: ["superadmin", "supervisor"] },
  { title: "System Control", path: "/app/system-control", icon: ShieldAlert, roles: ["superadmin"] },
  { title: "Subscription", path: "/app/subscription", icon: Timer, roles: ["superadmin"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut, roles, branchId, isAdmin } = useAuth();
  const { branches, selectedBranchId, setSelectedBranchId } = useData();
  const [branchName, setBranchName] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // For non-admin users, show their assigned branch name
  useEffect(() => {
    if (!isAdmin && branchId) {
      supabase.from("branches").select("name").eq("id", branchId).single().then(({ data }) => {
        if (data) setBranchName(data.name);
      });
    } else if (isAdmin && selectedBranchId) {
      const b = branches.find(br => br.id === selectedBranchId);
      setBranchName(b?.name || null);
    } else if (isAdmin) {
      setBranchName("All Branches");
    }
  }, [branchId, isAdmin, selectedBranchId, branches]);

  // Fetch system countdown for non-superadmin
  useEffect(() => {
    supabase.from("system_settings").select("setting_value").eq("setting_key", "system_countdown_end").maybeSingle()
      .then(({ data }) => {
        if (data?.setting_value) {
          const remaining = Math.max(0, Math.ceil((new Date(data.setting_value).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          setCountdown(remaining);
        }
      });
  }, []);

  const navItems = allNavItems.filter(item => {
    if (item.roles.length === 0) return true;
    return roles.some(r => item.roles.includes(r));
  });

  const roleLabel = roles[0]?.replace("_", " ") || "user";

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-50 w-64
        bg-sidebar text-sidebar-foreground
        flex flex-col transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
        shadow-xl lg:shadow-none
      `}>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <div className="relative">
            <img src={logo} alt="Wonder Aqua" className="h-11 w-11 rounded-xl object-cover ring-2 ring-sidebar-primary/30" />
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-sidebar" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sm leading-tight text-sidebar-foreground">Wonder Aqua</h2>
            <p className="text-[10px] text-sidebar-foreground/60">LTD Management</p>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto space-y-0.5">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 mx-2 rounded-lg
                  ${isActive
                    ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }
                `}
              >
                <item.icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-sidebar-primary" : ""}`} />
                <span className="truncate">{item.title}</span>
                {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary shrink-0" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          {/* Branch selector for admins & stock managers */}
          {(isAdmin || roles.includes("stock_manager")) && branches.length > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-sidebar-foreground/50 flex items-center gap-1">
                <GitBranch className="h-3 w-3" /> Branch
              </label>
              <Select
                value={selectedBranchId || "all"}
                onValueChange={(v) => setSelectedBranchId(v === "all" ? null : v)}
              >
                <SelectTrigger className="h-8 text-xs bg-sidebar-accent/50 border-sidebar-border">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="all">All Branches</SelectItem>}
                  {branches.filter(b => b.is_active).map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {profile && (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
                {profile.full_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-sidebar-foreground/70 truncate">{profile.full_name}</p>
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider mt-0.5">{roleLabel}</Badge>
              </div>
            </div>
          )}
          {branchName && (
            <p className="text-[10px] text-sidebar-foreground/50 truncate">📍 Branch: {branchName}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 glass-card border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6 text-foreground" />
          </button>
          <img src={logo} alt="Wonder Aqua" className="h-8 w-8 rounded-lg object-cover shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm text-foreground truncate">Wonder Aqua LTD</h1>
            <div className="flex items-center gap-1.5">
              {branchName && <p className="text-[10px] text-muted-foreground truncate">📍 {branchName}</p>}
              <Badge variant="outline" className="text-[8px] uppercase shrink-0">{roleLabel}</Badge>
            </div>
          </div>
          <ThemeToggle />
        </header>

        {/* Desktop top bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-2.5 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-3 text-sm">
            {branchName && <span className="font-medium text-foreground">📍 Branch: {branchName}</span>}
            {profile && <span className="text-muted-foreground">· {profile.full_name}</span>}
          </div>
          <div className="flex items-center gap-3">
            {countdown !== null && countdown <= 7 && (
              <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${countdown <= 3 ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-600"}`}>
                <Timer className="h-3 w-3" />
                {countdown === 0 ? "System expired" : `${countdown} days left`}
              </div>
            )}
            {roles.map(r => (
              <span key={r} className="gradient-bg text-primary-foreground px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider">{r.replace("_", " ")}</span>
            ))}
            <ThemeToggle />
          </div>
        </div>

        {/* Subscription warning banner */}
        <SubscriptionBanner />

        {/* Countdown warning banner */}
        {countdown !== null && countdown <= 3 && countdown > 0 && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">System countdown: {countdown} day{countdown !== 1 ? "s" : ""} remaining. Contact admin to extend.</span>
          </div>
        )}
        {countdown === 0 && (
          <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>System expired. Sales and inventory updates are restricted. Contact superadmin.</span>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 max-w-6xl animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
