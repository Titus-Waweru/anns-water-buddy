import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Droplets, BarChart3, Package, Users, Shield, TrendingUp } from "lucide-react";
import logo from "@/assets/logo.jpg";

const features = [
  { icon: Package, title: "Inventory Management", desc: "Track water bottle stock in real-time across all branches" },
  { icon: BarChart3, title: "Sales & Reports", desc: "Record sales, track profit, and generate business insights" },
  { icon: Users, title: "Customer Management", desc: "Manage customers, credit balances, and loyalty points" },
  { icon: Shield, title: "Role-Based Access", desc: "Secure access control for cashiers, managers, and admins" },
  { icon: TrendingUp, title: "Profit Tracking", desc: "Automatic profit calculations and performance analytics" },
  { icon: Droplets, title: "Multi-Branch", desc: "Manage multiple distribution points from one dashboard" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Wonder Aqua" className="h-10 w-10 rounded-lg object-cover" />
            <span className="font-bold text-foreground">Wonder Aqua LTD</span>
          </div>
          <div className="flex gap-2">
            <Link to="/login"><Button variant="outline" size="sm">Sign In</Button></Link>
            <Link to="/signup"><Button size="sm">Get Started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 lg:py-24 text-center">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Wonder Aqua" className="h-20 w-20 rounded-2xl object-cover shadow-lg" />
        </div>
        <h1 className="text-3xl lg:text-5xl font-bold text-foreground mb-4">
          Wonder Aqua LTD<br />
          <span className="text-primary">Management System</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
          A complete water distribution management platform. Track sales, manage inventory,
          monitor profit, and grow your business — all in one place.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/signup"><Button size="lg" className="text-base px-8">Get Started</Button></Link>
          <Link to="/login"><Button size="lg" variant="outline" className="text-base px-8">Sign In</Button></Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center text-foreground mb-10">Everything You Need</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title} className="bg-card border rounded-xl p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card/50 py-8">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4" />
            <span>Wonder Aqua LTD © {new Date().getFullYear()}</span>
          </div>
          <span>Water Distribution Management</span>
        </div>
      </footer>
    </div>
  );
}
