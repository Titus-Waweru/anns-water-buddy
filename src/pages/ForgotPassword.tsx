import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, ShieldCheck, RotateCcw, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";
import logo from "@/assets/logo.jpg";
import { useRef, useEffect } from "react";

export default function ForgotPassword() {
  const [step, setStep] = useState<"email" | "otp" | "reset">("email");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // OTP state
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

  const sendOtp = async () => {
    setSubmitting(true);
    setError("");
    try {
      const code = generateOtp();
      const otpData = { code, email, expiresAt: Date.now() + 5 * 60 * 1000 };
      localStorage.setItem("wa_reset_otp", JSON.stringify(otpData));

      const { error: fnError } = await supabase.functions.invoke("send-otp-email", {
        body: { email, otp: code, type: "reset" },
      });

      if (fnError) {
        setError("Failed to send verification code. Please try again.");
        console.error("OTP send error:", fnError);
      } else {
        setStep("otp");
        setCooldown(60);
      }
    } catch {
      setError("Failed to send code. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendOtp();
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newOtp.every(d => d !== "") && newOtp.join("").length === 6) {
      verifyOtp(newOtp.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      verifyOtp(pasted);
      e.preventDefault();
    }
  };

  const verifyOtp = async (code: string) => {
    setVerifying(true);
    setError("");
    const failsafe = setTimeout(() => {
      setVerifying(false);
      setError("Verification timed out. Please try again.");
    }, 10000);

    try {
      const stored = localStorage.getItem("wa_reset_otp");
      if (!stored) {
        setError("Session expired. Please request a new code.");
        setVerifying(false);
        clearTimeout(failsafe);
        return;
      }
      const otpData = JSON.parse(stored);
      if (otpData.email !== email) {
        setError("Email mismatch. Request a new code.");
        setVerifying(false);
        clearTimeout(failsafe);
        return;
      }
      if (Date.now() > otpData.expiresAt) {
        setError("Code expired. Request a new code.");
        localStorage.removeItem("wa_reset_otp");
        setVerifying(false);
        clearTimeout(failsafe);
        return;
      }
      if (otpData.code !== code) {
        setError("Invalid code. Please try again.");
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        setVerifying(false);
        clearTimeout(failsafe);
        return;
      }

      localStorage.removeItem("wa_reset_otp");
      clearTimeout(failsafe);
      setVerifying(false);

      // Sign in the user first so we can update password
      // We need the user to be authenticated to update their password
      setStep("reset");
    } catch {
      clearTimeout(failsafe);
      setError("Verification failed. Please try again.");
      setVerifying(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    // Use Supabase resetPasswordForEmail to send a magic link, then user sets password
    // Since we already verified identity via OTP, we use the admin approach:
    // Actually, we need the user to be signed in to call updateUser.
    // Alternative: use resetPasswordForEmail which sends a link
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setResetDone(true);
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
            {step === "email" && "Reset Password"}
            {step === "otp" && "Verify Your Identity"}
            {step === "reset" && "Set New Password"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {step === "email" && "Enter your email to receive a verification code"}
            {step === "otp" && <>We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span></>}
            {step === "reset" && (resetDone ? "Check your email for a reset link" : "We've verified your identity. A reset link will be sent to your email.")}
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">{error}</div>
          )}

          {step === "email" && (
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
                <Button variant="outline" className="w-full gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back to Sign In
                </Button>
              </Link>
            </form>
          )}

          {step === "otp" && !resetDone && (
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
                    disabled={verifying}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                </div>
              )}

              <div className="text-center space-y-3">
                <p className="text-xs text-muted-foreground">Code expires in 5 minutes</p>
                <Button variant="ghost" size="sm" onClick={sendOtp} disabled={cooldown > 0 || submitting} className="gap-2">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
                </Button>
              </div>
              <Button variant="outline" className="w-full mt-4" onClick={() => { setStep("email"); setOtp(["", "", "", "", "", ""]); }} disabled={verifying}>
                ← Back
              </Button>
            </>
          )}

          {step === "reset" && !resetDone && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Your identity has been verified. Click below to receive a password reset link.
              </p>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Reset Link
              </Button>
            </form>
          )}

          {resetDone && (
            <div className="space-y-4 text-center">
              <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <Lock className="h-6 w-6 text-success" />
              </div>
              <p className="text-sm text-muted-foreground">
                We've sent a password reset link to <span className="font-medium text-foreground">{email}</span>. Please check your inbox.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full gap-2">
                  <ArrowLeft className="h-4 w-4" /> Back to Sign In
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
