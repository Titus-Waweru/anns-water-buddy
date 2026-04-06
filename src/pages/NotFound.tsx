import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Home, LayoutDashboard, ArrowLeft, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // Generate decorative water ripple animations
  useEffect(() => {
    const interval = setInterval(() => {
      setRipples((prev) => {
        const newRipple = {
          id: Date.now(),
          x: Math.random() * 100,
          y: Math.random() * 100,
        };
        const filtered = prev.filter((r) => Date.now() - r.id < 3000);
        return [...filtered, newRipple].slice(-6);
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-accent/30 to-background relative overflow-hidden">
      {/* Animated ripples */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute rounded-full border-2 border-primary/10 animate-ping pointer-events-none"
          style={{
            left: `${ripple.x}%`,
            top: `${ripple.y}%`,
            width: "80px",
            height: "80px",
            animationDuration: "3s",
          }}
        />
      ))}

      {/* Decorative water drops */}
      <div className="absolute top-20 left-10 opacity-10">
        <Droplets className="h-32 w-32 text-primary" />
      </div>
      <div className="absolute bottom-20 right-10 opacity-10">
        <Droplets className="h-24 w-24 text-secondary" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-lg mx-auto">
        {/* Large 404 with gradient */}
        <div className="mb-6">
          <h1 className="text-[120px] sm:text-[160px] font-extrabold leading-none tracking-tighter bg-gradient-to-br from-primary via-secondary to-primary bg-clip-text text-transparent select-none">
            404
          </h1>
        </div>

        {/* Water drop icon */}
        <div className="flex justify-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Droplets className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">
          Page Not Found
        </h2>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          The page <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{location.pathname}</span> doesn't exist. 
          It may have been moved or you may have mistyped the URL.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/app">
            <Button size="lg" className="w-full sm:w-auto gap-2 shadow-lg shadow-primary/20">
              <LayoutDashboard className="h-4 w-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2">
              <Home className="h-4 w-4" />
              Go to Home
            </Button>
          </Link>
        </div>

        <button
          onClick={() => window.history.back()}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Go back
        </button>

        {/* Footer brand */}
        <div className="mt-12 pt-6 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Wonder Aqua LTD Management System
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
