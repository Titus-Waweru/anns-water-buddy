import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validToken, setValidToken] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setValidToken(true);
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setValidToken(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const getPasswordStrength = (pw: string) => {
    if (pw.length < 6) return { label: "Too short", color: "text-destructive", pct: 15 };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { label: "Weak", color: "text-destructive", pct: 33 };
    if (score <= 2) return { label: "Medium", color: "text-yellow-600", pct: 60 };
    return { label: "Strong", color: "text-success", pct: 100 };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError("");
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    }
    setSubmitting(false);
  };

  if (!validToken && !window.location.hash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-muted-foreground">Invalid or expired reset link.</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate("/forgot-password")} variant="outline" className="w-full">
                Request New Link
              </Button>
              <Button onClick={() => navigate("/login")} variant="ghost" className="w-full">
                Back to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src={logo} alt="Wonder Aqua" className="h-16 w-16 rounded-xl object-cover" />
          </div>
          <CardTitle className="text-xl">{success ? "Password Updated" : "Set New Password"}</CardTitle>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-success mx-auto" />
              <p className="text-sm text-muted-foreground">Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{error}</div>
              )}
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <PasswordInput
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                />
                {password.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          strength.pct <= 33 ? "bg-destructive" : strength.pct <= 60 ? "bg-yellow-500" : "bg-success"
                        }`}
                        style={{ width: `${strength.pct}%` }}
                      />
                    </div>
                    <p className={`text-xs ${strength.color}`}>{strength.label}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <PasswordInput
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  minLength={6}
                />
                {confirm.length > 0 && password !== confirm && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
              <div className="flex flex-col gap-2 pt-2">
                <Link to="/login" className="text-center text-sm text-primary hover:underline">
                  Back to Login
                </Link>
                <Link to="/forgot-password" className="text-center text-sm text-muted-foreground hover:underline">
                  Request new reset link
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
