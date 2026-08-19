import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, ShieldCheck, RotateCcw, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import logo from "@/assets/logo.jpg";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp" | "reset">("email");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const invoke = async (payload: Record<string, unknown>) => {
    const { data, error: fnError } = await supabase.functions.invoke("password-reset", { body: payload });
    if (fnError) {
      // Try to surface the function's own message
      const ctx = (fnError as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          if (body?.error) return { error: body.error as string };
        } catch { /* ignore */ }
      }
      return { error: "Something went wrong. Please try again." };
    }
    if (data?.error) return { error: data.error as string };
    return { error: null };
  };

  const sendOtp = async () => {
    setSubmitting(true);
    setError("");
    const { error: err } = await invoke({ action: "request", email: email.trim().toLowerCase() });
    if (err) setError(err);
    else {
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
      setCooldown(60);
    }
    setSubmitting(false);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendOtp();
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (next.every(d => d !== "")) setStep("reset");
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      setStep("reset");
      e.preventDefault();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (newPassword !== confirmPassword) return setError("Passwords do not match.");

    setSubmitting(true);
    const { error: err } = await invoke({
      action: "confirm",
      email: email.trim().toLowerCase(),
      code: otp.join(""),
      password: newPassword,
    });
    if (err) {
      setError(err);
      if (/code/i.test(err)) {
        setOtp(["", "", "", "", "", ""]);
        setStep("otp");
      }
    } else {
      setResetDone(true);
      setTimeout(() => navigate("/login"), 2500);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src={logo} alt="Wonder Aqua" className="h-16 w-16 rounded-xl object-cover" />
          </div>
          <CardTitle className="text-xl">
            {resetDone ? "Password Updated" : step === "email" ? "Reset Password" : step === "otp" ? "Verify Your Identity" : "Set New Password"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {resetDone ? "You can now sign in with your new password" :
              step === "email" ? "Enter your email to receive a verification code" :
              step === "otp" ? <>We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span></> :
              "Choose a new password for your account"}
          </p>
        </CardHeader>
        <CardContent>
          {error && !resetDone && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>
          )}

          {resetDone && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-12 w-12 text-success mx-auto" />
              <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
              <Link to="/login" className="block">
                <Button className="w-full">Go to Sign In</Button>
              </Link>
            </div>
          )}

          {!resetDone && step === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Verification Code
              </Button>
              <Link to="/login" className="block">
                <Button type="button" variant="outline" className="w-full gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back to Sign In
                </Button>
              </Link>
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/signup" className="text-primary font-medium hover:underline">Create one</Link>
              </p>
            </form>
          )}

          {!resetDone && step === "otp" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
                {otp.map((digit, i) => (
                  <Input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              <div className="text-center space-y-3">
                <p className="text-xs text-muted-foreground">Code expires in 10 minutes</p>
                <Button variant="ghost" size="sm" onClick={sendOtp} disabled={cooldown > 0 || submitting} className="gap-2">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
                </Button>
              </div>
              <Button variant="outline" className="w-full mt-4" onClick={() => { setStep("email"); setOtp(["", "", "", "", "", ""]); }}>
                ← Back
              </Button>
            </>
          )}

          {!resetDone && step === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <PasswordInput value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" required minLength={6} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <PasswordInput value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" required minLength={6} />
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => setStep("otp")} disabled={submitting}>
                ← Back to code
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
