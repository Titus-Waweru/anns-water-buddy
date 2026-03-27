import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import AppLayout from "@/components/AppLayout";
import LandingPage from "@/pages/LandingPage";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import PendingApproval from "@/pages/PendingApproval";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import Sales from "@/pages/Sales";
import Purchases from "@/pages/Purchases";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import Transactions from "@/pages/Transactions";
import Reports from "@/pages/Reports";
import Teams from "@/pages/Teams";
import Branches from "@/pages/Branches";
import CashSubmission from "@/pages/CashSubmission";
import Assets from "@/pages/Assets";
import Vouchers from "@/pages/Vouchers";
import Production from "@/pages/Production";
import Targets from "@/pages/Targets";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isApproved } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/pending" replace />;

  return <>{children}</>;
}

/** Route guard for specific roles */
function RoleRoute({ children, allowed }: { children: React.ReactNode; allowed: string[] }) {
  const { roles, isAdmin } = useAuth();
  // Admins always pass
  if (isAdmin) return <>{children}</>;
  if (allowed.length > 0 && !roles.some(r => allowed.includes(r))) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access this page.</div>;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/pending" element={<PendingApproval />} />

            <Route path="/app/*" element={
              <ProtectedRoute>
                <DataProvider>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/inventory" element={<Inventory />} />
                      <Route path="/sales" element={<RoleRoute allowed={["cashier", "stock_manager"]}><Sales /></RoleRoute>} />
                      <Route path="/purchases" element={<RoleRoute allowed={[]}><Purchases /></RoleRoute>} />
                      <Route path="/customers" element={<RoleRoute allowed={["cashier"]}><Customers /></RoleRoute>} />
                      <Route path="/suppliers" element={<RoleRoute allowed={[]}><Suppliers /></RoleRoute>} />
                      <Route path="/transactions" element={<RoleRoute allowed={[]}><Transactions /></RoleRoute>} />
                      <Route path="/reports" element={<RoleRoute allowed={[]}><Reports /></RoleRoute>} />
                      <Route path="/teams" element={<RoleRoute allowed={[]}><Teams /></RoleRoute>} />
                      <Route path="/branches" element={<RoleRoute allowed={[]}><Branches /></RoleRoute>} />
                      <Route path="/cash-submission" element={<RoleRoute allowed={["cashier"]}><CashSubmission /></RoleRoute>} />
                      <Route path="/assets" element={<RoleRoute allowed={[]}><Assets /></RoleRoute>} />
                      <Route path="/vouchers" element={<RoleRoute allowed={[]}><Vouchers /></RoleRoute>} />
                      <Route path="/production" element={<RoleRoute allowed={["stock_manager"]}><Production /></RoleRoute>} />
                      <Route path="/targets" element={<RoleRoute allowed={[]}><Targets /></RoleRoute>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </DataProvider>
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
