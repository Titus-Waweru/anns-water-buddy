import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import logo from "@/assets/logo.jpg";

interface OtpVerifyProps {
  email: string;
  type: "signup" | "login";
  onBack: () => void;
}

export default function OtpVerify({ email, type, onBack }: OtpVerifyProps) {
  const { refreshProfile, profile, isApproved } = useAuth();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Generate and send OTP on mount
  useEffect(() => {
    sendOtp();
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // After OTP verified, redirect with a short delay (don't wait on profile)
  useEffect(() => {
    if (!verified) return;

    // Give profile a moment to load, but don't wait forever
    const redirectTimeout = setTimeout(() => {
      if (type === "signup") {
        window.location.href = "/pending";
      } else if (profile && isApproved) {
        window.location.href = "/app";
      } else if (profile && !isApproved) {
        window.location.href = "/pending";
      } else {
        // Profile not loaded yet — default redirect
        window.location.href = "/app";
      }
    }, 1500);

    return () => clearTimeout(redirectTimeout);
  }, [verified, profile, isApproved, type]);

  const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const sendOtp = async () => {
    setSending(true);
    setError("");
    try {
      const code = generateOtp();
      // Store OTP in localStorage with expiry (5 min)
      const otpData = { code, email, expiresAt: Date.now() + 5 * 60 * 1000 };
      localStorage.setItem("wa_otp", JSON.stringify(otpData));

      const { error: fnError } = await supabase.functions.invoke("send-otp-email", {
        body: { email, otp: code, type },
      });

      if (fnError) {
        setError("Failed to send verification code. Please try again.");
        console.error("OTP send error:", fnError);
      } else {
        setSent(true);
        setCooldown(60);
      }
    } catch (err) {
      setError("Failed to send code. Check your connection.");
    } finally {
      setSending(false);
    }
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

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
      const newOtp = pasted.split("");
      setOtp(newOtp);
      verifyOtp(pasted);
      e.preventDefault();
    }
  };

  const verifyOtp = async (code: string) => {
    setVerifying(true);
    setError("");

    // Failsafe timeout — never hang forever
    const failsafe = setTimeout(() => {
      setVerifying(false);
      setError("Verification timed out. Please try again.");
    }, 10000);

    try {
      const stored = localStorage.getItem("wa_otp");
      if (!stored) {
        setError("Verification session expired. Please request a new code.");
        setVerifying(false);
        clearTimeout(failsafe);
        return;
      }

      const otpData = JSON.parse(stored);
      if (otpData.email !== email) {
        setError("Email mismatch. Please request a new code.");
        setVerifying(false);
        clearTimeout(failsafe);
        return;
      }
      if (Date.now() > otpData.expiresAt) {
        setError("Code expired. Please request a new code.");
        localStorage.removeItem("wa_otp");
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

      // OTP verified — clean up
      localStorage.removeItem("wa_otp");
      console.log("OTP verified successfully for:", email);

      // Try refreshing profile but don't block on it
      try {
        await refreshProfile();
      } catch (e) {
        console.warn("Profile refresh after OTP failed, proceeding anyway:", e);
      }

      clearTimeout(failsafe);
      setVerified(true);
      setVerifying(false);
    } catch (err) {
      clearTimeout(failsafe);
      console.error("OTP verification error:", err);
      setError("Verification failed. Please try again.");
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-8 space-y-6">
          <div className="text-center space-y-3">
            <img src={logo} alt="Wonder Aqua" className="h-14 w-14 rounded-xl object-cover mx-auto" />
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Verify Your Identity</h2>
            <p className="text-sm text-muted-foreground">
              {sent
                ? <>We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span></>
                : "Sending verification code..."
              }
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">{error}</div>
          )}

          {sending && !sent ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : verified ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verified! Redirecting...</p>
            </div>
          ) : (
            <>
              {/* OTP Input */}
              <div className="flex justify-center gap-2" onPaste={handlePaste}>
                {otp.map((digit, i) => (
                  <Input
                    key={i}
                    ref={el => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold"
                    disabled={verifying}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                </div>
              )}

              <div className="text-center space-y-3">
                <p className="text-xs text-muted-foreground">Code expires in 5 minutes</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={sendOtp}
                  disabled={cooldown > 0 || sending}
                  className="gap-2"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend Code"}
                </Button>
              </div>

              <Button variant="outline" className="w-full" onClick={onBack} disabled={verifying}>
                ← Back
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
