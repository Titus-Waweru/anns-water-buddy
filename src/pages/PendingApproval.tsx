import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Loader2 } from "lucide-react";
import logo from "@/assets/logo.jpg";

export default function PendingApproval() {
  const { user, loading, isApproved, profile, signOut } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isApproved) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center space-y-4">
          <img src={logo} alt="Wonder Aqua" className="h-16 w-16 rounded-xl object-cover mx-auto" />
          <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center mx-auto">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Awaiting Approval</h2>
          <p className="text-muted-foreground">
            Hi {profile?.full_name || "there"}, your account is pending supervisor approval.
            You'll be able to access the system once approved.
          </p>
          {profile?.status === "rejected" && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              Your account has been rejected. Please contact your supervisor.
            </div>
          )}
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </CardContent>
      </Card>
    </div>
  );
}
