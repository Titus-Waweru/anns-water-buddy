import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DataProvider } from "@/context/DataContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import StockTransfer from "@/pages/StockTransfer";
import Announcements from "@/pages/Announcements";
import RawBottleInventory from "@/pages/RawBottleInventory";
import CashReconciliation from "@/pages/CashReconciliation";
import Targets from "@/pages/Targets";
import SystemControl from "@/pages/SystemControl";
import SubscriptionSettings from "@/pages/SubscriptionSettings";
import PaymentsTrace from "@/pages/PaymentsTrace";

import NotFound from "@/pages/NotFound";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsAndConditions from "@/pages/TermsAndConditions";
import { Skeleton } from "@/components/ui/skeleton";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function LoadingSkeleton() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-4">
      <Skeleton className="h-12 w-12 rounded-xl" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

/** Smart landing: if installed as PWA, skip landing page — always defined */
function SmartLanding() {
  const { user, loading, isApproved, profile } = useAuth();
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as any).standalone === true;

  if (loading) return <LoadingSkeleton />;

  // In standalone (installed) mode, never show landing page
  if (isStandalone) {
    if (user && profile && isApproved) return <Navigate to="/app" replace />;
    return <Navigate to="/login" replace />;
  }

  // If logged in on web, redirect to app
  if (user && profile && isApproved) return <Navigate to="/app" replace />;
  if (user && profile && !isApproved) return <Navigate to="/pending" replace />;

  return <LandingPage />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isApproved, profile } = useAuth();

  if (loading) return <LoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  // Wait for profile to load before deciding — prevents wrong redirect
  if (!profile) return <LoadingSkeleton />;
  if (!isApproved) return <Navigate to="/pending" replace />;

  return <>{children}</>;
}

/** Route guard for specific roles */
function RoleRoute({ children, allowed }: { children: React.ReactNode; allowed: string[] }) {
  const { roles, isAdmin } = useAuth();
  if (isAdmin) return <>{children}</>;
  if (allowed.length > 0 && !roles.some(r => allowed.includes(r))) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access this page.</div>;
  }
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<SmartLanding />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pending" element={<PendingApproval />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />

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
                        <Route path="/raw-bottles" element={<RoleRoute allowed={["stock_manager"]}><RawBottleInventory /></RoleRoute>} />
                        <Route path="/production" element={<RoleRoute allowed={["stock_manager"]}><Production /></RoleRoute>} />
                        <Route path="/stock-transfer" element={<RoleRoute allowed={["stock_manager"]}><StockTransfer /></RoleRoute>} />
                        <Route path="/announcements" element={<Announcements />} />
                        <Route path="/targets" element={<RoleRoute allowed={[]}><Targets /></RoleRoute>} />
                        <Route path="/system-control" element={<SystemControl />} />
                        <Route path="/subscription" element={<SubscriptionSettings />} />
                        <Route path="/payments-trace" element={<RoleRoute allowed={["superadmin"]}><PaymentsTrace /></RoleRoute>} />
                        <Route path="/cash-reconciliation" element={<RoleRoute allowed={["cashier"]}><CashReconciliation /></RoleRoute>} />

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
  </ErrorBoundary>
);

export default App;
