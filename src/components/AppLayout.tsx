import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building, FileText, BarChart3, Menu, X, Droplets, LogOut,
  DollarSign, Wrench, Receipt, Factory, Target,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.jpg";

interface NavItem {
  title: string;
  path: string;
  icon: any;
  roles: string[]; // empty = all roles
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
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, signOut, roles, branchId } = useAuth();
  const [branchName, setBranchName] = useState<string | null>(null);

  useEffect(() => {
    if (branchId) {
      supabase.from("branches").select("name").eq("id", branchId).single().then(({ data }) => {
        if (data) setBranchName(data.name);
      });
    }
  }, [branchId]);

  const navItems = allNavItems.filter(item => {
    if (item.roles.length === 0) return true;
    return roles.some(r => item.roles.includes(r));
  });

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-50 w-64 bg-primary text-primary-foreground
        flex flex-col transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
      `}>
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <img src={logo} alt="Wonder Aqua" className="h-12 w-12 rounded-lg object-cover bg-primary-foreground" />
          <div className="min-w-0">
            <h2 className="font-bold text-sm leading-tight text-primary-foreground">Wonder Aqua</h2>
            <p className="text-[10px] text-primary-foreground/70">LTD Management</p>
          </div>
          <button className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors mx-2 rounded-lg
                  ${isActive
                    ? "bg-sidebar-accent text-primary-foreground"
                    : "text-primary-foreground/70 hover:bg-sidebar-accent/50 hover:text-primary-foreground"
                  }
                `}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          {profile && (
            <p className="text-xs text-primary-foreground/70 truncate">{profile.full_name}</p>
          )}
          {branchName && (
            <p className="text-[10px] text-primary-foreground/50 truncate">Branch: {branchName}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
          <div className="flex items-center gap-2 text-xs text-primary-foreground/50">
            <Droplets className="h-4 w-4" />
            <span>Wonder Aqua LTD</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-30 bg-card border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6 text-foreground" />
          </button>
          <img src={logo} alt="Wonder Aqua" className="h-8 w-8 rounded-md object-cover" />
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm text-foreground">Wonder Aqua LTD</h1>
            {branchName && <p className="text-[10px] text-muted-foreground truncate">Branch: {branchName}</p>}
          </div>
        </header>

        {/* Desktop branch header */}
        <div className="hidden lg:flex items-center justify-between px-6 py-2 border-b bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {branchName && <span className="font-medium text-foreground">📍 Branch: {branchName}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {roles.length > 0 && roles.map(r => (
              <span key={r} className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium uppercase">{r.replace("_", " ")}</span>
            ))}
          </div>
        </div>

        <main className="flex-1 p-4 lg:p-6 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}
