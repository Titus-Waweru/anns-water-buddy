import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, Building, FileText, BarChart3, Menu, X, Droplets,
} from "lucide-react";
import logo from "@/assets/logo.jpg";

const navItems = [
  { title: "Dashboard", path: "/", icon: LayoutDashboard },
  { title: "Inventory", path: "/inventory", icon: Package },
  { title: "Sales", path: "/sales", icon: ShoppingCart },
  { title: "Purchases", path: "/purchases", icon: Truck },
  { title: "Customers", path: "/customers", icon: Users },
  { title: "Suppliers", path: "/suppliers", icon: Building },
  { title: "Transactions", path: "/transactions", icon: FileText },
  { title: "Reports", path: "/reports", icon: BarChart3 },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen z-50 w-64 bg-primary text-primary-foreground
        flex flex-col transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
          <img src={logo} alt="Wonder Aqua" className="h-12 w-12 rounded-lg object-cover bg-primary-foreground" />
          <div className="min-w-0">
            <h2 className="font-bold text-sm leading-tight text-primary-foreground">Ann's Water</h2>
            <p className="text-[10px] text-primary-foreground/70">Business Manager</p>
          </div>
          <button className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors mx-2 rounded-lg
                  ${isActive
                    ? "bg-sidebar-accent text-primary-foreground"
                    : "text-primary-foreground/70 hover:bg-sidebar-accent/50 hover:text-primary-foreground"
                  }
                `}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2 text-xs text-primary-foreground/50">
            <Droplets className="h-4 w-4" />
            <span>Wonder Aqua</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 bg-card border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6 text-foreground" />
          </button>
          <img src={logo} alt="Wonder Aqua" className="h-8 w-8 rounded-md object-cover" />
          <h1 className="font-bold text-sm text-foreground">Ann's Water Business</h1>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-5xl">
          {children}
        </main>
      </div>
    </div>
  );
}
