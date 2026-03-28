import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Droplets, BarChart3, Package, Users, Shield, TrendingUp, ArrowRight } from "lucide-react";
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
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Wonder Aqua" className="h-10 w-10 rounded-xl object-cover ring-2 ring-primary/20" />
            <span className="font-bold text-foreground text-lg">Wonder Aqua LTD</span>
          </div>
          <div className="flex gap-2">
            <Link to="/login"><Button variant="outline" size="sm">Sign In</Button></Link>
            <Link to="/signup"><Button size="sm" className="gradient-bg border-0">Get Started</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 lg:py-28 text-center">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <img src={logo} alt="Wonder Aqua" className="h-24 w-24 rounded-2xl object-cover shadow-2xl ring-4 ring-primary/20" />
            <div className="absolute -inset-4 rounded-3xl bg-primary/5 -z-10 blur-xl" />
          </div>
        </div>
        <h1 className="text-4xl lg:text-6xl font-extrabold text-foreground mb-5 leading-tight">
          Wonder Aqua LTD<br />
          <span className="gradient-text">Management System</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          A complete water distribution management platform. Track sales, manage inventory,
          monitor profit, and grow your business — all in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/signup">
            <Button size="lg" className="gradient-bg border-0 text-base px-8 gap-2 shadow-lg hover:shadow-xl transition-shadow">
              Get Started <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login"><Button size="lg" variant="outline" className="text-base px-8">Sign In</Button></Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center text-foreground mb-3">Everything You Need</h2>
        <p className="text-center text-muted-foreground mb-12">Powerful tools built for water distribution businesses</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={f.title} className="glass-card p-6 space-y-4 animate-slide-up hover:shadow-xl transition-all duration-300" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="h-12 w-12 rounded-xl gradient-bg flex items-center justify-center shadow-lg">
                <f.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm py-8">
        <div className="max-w-6xl mx-auto px-4 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Droplets className="h-4 w-4 text-secondary" />
              <span>Wonder Aqua LTD © {new Date().getFullYear()}</span>
            </div>
            <span>Water Distribution Management</span>
          </div>
          <div className="text-center">
            <p className="text-xs italic text-muted-foreground/60">
              Developed by <span className="gradient-text font-medium not-italic">Titus W. Ngari</span> — <span className="gradient-text font-medium not-italic">Jenga Systems</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
