import { useMemo, useState, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { filterPaidSales } from "@/lib/paymentStatus";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, ShoppingCart, TrendingUp, AlertTriangle, DollarSign, ArrowDownCircle, Users, CreditCard, Target, Trophy, Megaphone, Bell, Info, ExternalLink } from "lucide-react";
import SubscriptionCard from "@/components/SubscriptionCard";
import AnimatedPage from "@/components/AnimatedPage";
import AnimatedCounter from "@/components/AnimatedCounter";
import { motion } from "framer-motion";
import { format, isToday, startOfMonth, isAfter, subDays, startOfDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Link } from "react-router-dom";

const COLORS = ["hsl(195,85%,55%)", "hsl(142,71%,45%)", "hsl(38,92%,50%)", "hsl(0,72%,51%)", "hsl(220,70%,22%)"];

interface UserTarget {
  id: string;
  target_type: string;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end: string;
  reward: string;
  consequence: string;
  period: string;
}

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: "Normal" | "Important" | "Critical";
  created_by: string;
  created_at: string;
  is_pinned: boolean;
}

export default function Dashboard() {
  const { products, sales: allSales, purchases, customers } = useData();
  // Only settled payments contribute to revenue, profit and charts.
  const sales = filterPaidSales(allSales as any) as typeof allSales;
  const { profile, user, isAdmin, roles } = useAuth();
  const [myTargets, setMyTargets] = useState<UserTarget[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifAnnouncement, setNotifAnnouncement] = useState<Announcement | null>(null);

  // Fetch targets for current user
  useEffect(() => {
    if (!user) return;
    supabase.from("targets").select("*")
      .eq("user_id", user.id)
      .gte("period_end", new Date().toISOString().split("T")[0])
      .then(({ data }) => {
        if (data) setMyTargets(data.map(t => ({
          ...t,
          reward: (t as any).reward || "",
          consequence: (t as any).consequence || "",
          period: (t as any).period || "monthly",
        })));
      });
  }, [user]);

  // Fetch active announcements
  useEffect(() => {
    if (!user) return;
    (supabase as any).rpc("get_active_announcements").then(({ data }: { data: Announcement[] | null }) => {
      if (data) {
        setAnnouncements(data);
        // Show notification for the newest Important or Critical announcement
        const importantOrCritical = data.find(a => a.priority === "Critical" || a.priority === "Important");
        if (importantOrCritical) {
          // Check if we've already shown this one (using localStorage)
          const seenId = localStorage.getItem("last_seen_announcement");
          if (seenId !== importantOrCritical.id) {
            setNotifAnnouncement(importantOrCritical);
            setNotifOpen(true);
            localStorage.setItem("last_seen_announcement", importantOrCritical.id);
          }
        }
      }
    });
  }, [user]);

  // Announcements are already sorted by the RPC: pinned first, then by priority, then by date

  const todaySales = sales.filter(s => isToday(new Date(s.date)));
  const monthStart = startOfMonth(new Date());
  const monthSales = sales.filter(s => isAfter(new Date(s.date), monthStart));
  const monthPurchases = purchases.filter(p => isAfter(new Date(p.date), monthStart));

  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.final_amount, 0);
  const todayPurchasesTotal = purchases.filter(p => isToday(new Date(p.date))).reduce((sum, p) => sum + p.total_cost, 0);
  const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
  const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.final_amount, 0);
  const monthPurchaseTotal = monthPurchases.reduce((sum, p) => sum + p.total_cost, 0);
  const totalInventory = products.reduce((sum, p) => sum + p.quantity, 0);
  const lowStockProducts = products.filter(p => p.quantity <= p.low_stock_threshold);
  const totalDebt = customers.reduce((sum, c) => sum + c.credit_balance, 0);
  const debtCustomers = customers.filter(c => c.credit_balance > 0);

  // Expected vs actual profit (based on inventory margin)
  const expectedProfit = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.selling_price - p.buying_price) * p.quantity, 0);
  }, [products]);
  const profitDiff = monthProfit - expectedProfit;
  const profitMismatch = expectedProfit > 0 && Math.abs(profitDiff) > expectedProfit * 0.1;

  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const dayStr = format(day, "yyyy-MM-dd");
      const label = format(day, "EEE");
      const daySales = sales.filter(s => format(new Date(s.date), "yyyy-MM-dd") === dayStr);
      const dayPurch = purchases.filter(p => format(new Date(p.date), "yyyy-MM-dd") === dayStr);
      days.push({
        day: label,
        Revenue: daySales.reduce((s, x) => s + x.final_amount, 0),
        Purchases: dayPurch.reduce((s, x) => s + x.total_cost, 0),
        Profit: daySales.reduce((s, x) => s + x.profit, 0),
      });
    }
    return days;
  }, [sales, purchases]);

  const paymentData = useMemo(() => {
    const cash = monthSales.filter(s => s.payment_mode === "Cash").reduce((a, s) => a + s.final_amount, 0);
    const mpesa = monthSales.filter(s => s.payment_mode === "Mpesa").reduce((a, s) => a + s.final_amount, 0);
    const credit = monthSales.filter(s => s.payment_mode === "Credit").reduce((a, s) => a + s.final_amount, 0);
    return [
      { name: "Cash", value: cash },
      { name: "Mpesa", value: mpesa },
      { name: "Credit", value: credit },
    ].filter(d => d.value > 0);
  }, [monthSales]);

  const stockData = useMemo(() => {
    return products.slice(0, 10).map(p => ({
      name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name,
      Stock: p.quantity,
      Threshold: p.low_stock_threshold,
    }));
  }, [products]);

  const recentSales = allSales.slice(0, 5);
  const recentPurchases = purchases.slice(0, 5);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const isCashier = roles.includes("cashier") && !isAdmin;
  const isStockMgr = roles.includes("stock_manager") && !isAdmin;

  const cardMotion = {
    initial: { opacity: 0, y: 20, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.35 },
  };

  return (
    <AnimatedPage>
    <div className="space-y-6">
      {/* Subscription Status Card */}
      <SubscriptionCard />

      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting()}, {profile?.full_name?.split(" ")[0] || "there"} 👋</h1>
        <p className="text-muted-foreground text-sm">Here's your Wonder Aqua overview</p>
      </div>

      {/* Announcements Widget */}
      {announcements.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Announcements
            </CardTitle>
            <Link to="/app/announcements">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                View All <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {announcements.slice(0, 5).map(a => {
              const priorityColors: Record<string, string> = {
                Normal: "bg-secondary text-secondary-foreground",
                Important: "bg-yellow-500/15 text-yellow-600",
                Critical: "bg-destructive/15 text-destructive",
              };
              return (
                <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${a.priority === "Critical" ? "bg-destructive/10" : a.priority === "Important" ? "bg-yellow-500/10" : "bg-secondary"}`}>
                    <Megaphone className={`h-4 w-4 ${a.priority === "Critical" ? "text-destructive" : a.priority === "Important" ? "text-yellow-600" : "text-secondary-foreground"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={`text-[9px] ${priorityColors[a.priority]}`}>{a.priority}</Badge>
                      {a.is_pinned && <span className="text-[10px]" title="Pinned">📌</span>}
                      <span className="text-xs font-semibold text-foreground">{a.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.message}</p>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{format(new Date(a.created_at), "dd MMM")}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* My Targets (for cashiers / stock managers) */}
      {myTargets.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> My Targets</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {myTargets.map(t => {
              const pct = t.target_value > 0 ? Math.min(100, (t.current_value / t.target_value) * 100) : 0;
              const remaining = Math.max(0, t.target_value - t.current_value);
              const statusColor = pct >= 75 ? "text-success" : pct >= 40 ? "text-yellow-600" : "text-destructive";
              const statusLabel = pct >= 75 ? "On Track" : pct >= 40 ? "Behind" : "At Risk";
              return (
                <Card key={t.id} className="border-primary/20">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize text-foreground">{t.target_type} Target</span>
                      <Badge variant="outline" className={`${statusColor} text-[10px]`}>{statusLabel}</Badge>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Current: {t.target_type === "sales" ? t.current_value : `KSh ${t.current_value.toLocaleString()}`}</span>
                      <span>Target: {t.target_type === "sales" ? t.target_value : `KSh ${t.target_value.toLocaleString()}`}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Remaining: <strong>{t.target_type === "sales" ? remaining : `KSh ${remaining.toLocaleString()}`}</strong></p>
                    {t.reward && <p className="text-xs text-success flex items-center gap-1"><Trophy className="h-3 w-3" /> {t.reward}</p>}
                    {t.consequence && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {t.consequence}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0 }}>
          <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Today's Sales</p><p className="text-xl font-bold text-foreground"><AnimatedCounter value={todaySalesTotal} prefix="KSh " /></p></div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><ShoppingCart className="h-5 w-5 text-secondary" /></div>
            </div>
          </CardContent></Card>
        </motion.div>
        {!isCashier && (
          <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.05 }}>
            <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground font-medium">Today's Purchases</p><p className="text-xl font-bold text-foreground"><AnimatedCounter value={todayPurchasesTotal} prefix="KSh " /></p></div>
                <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><ArrowDownCircle className="h-5 w-5 text-secondary" /></div>
              </div>
            </CardContent></Card>
          </motion.div>
        )}
        {!isCashier && (
          <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.1 }}>
            <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground font-medium">Today's Profit</p><p className="text-xl font-bold text-success"><AnimatedCounter value={todayProfit} prefix="KSh " /></p></div>
                <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><TrendingUp className="h-5 w-5 text-success" /></div>
              </div>
            </CardContent></Card>
          </motion.div>
        )}
        {!isCashier && !isStockMgr && (
          <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.15 }}>
            <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground font-medium">Monthly Profit</p><p className="text-xl font-bold text-success"><AnimatedCounter value={monthProfit} prefix="KSh " /></p></div>
                <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><DollarSign className="h-5 w-5 text-success" /></div>
              </div>
            </CardContent></Card>
          </motion.div>
        )}
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.2 }}>
          <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Inventory</p><p className="text-xl font-bold text-foreground"><AnimatedCounter value={totalInventory} suffix=" bottles" /></p></div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><Package className="h-5 w-5 text-secondary" /></div>
            </div>
          </CardContent></Card>
        </motion.div>
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.25 }}>
          <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground font-medium">Low Stock</p><p className="text-xl font-bold text-destructive"><AnimatedCounter value={lowStockProducts.length} suffix=" items" /></p></div>
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            </div>
          </CardContent></Card>
        </motion.div>
        {!isStockMgr && (
          <>
            <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.3 }}>
              <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground font-medium">Customers</p><p className="text-xl font-bold text-foreground"><AnimatedCounter value={customers.length} /></p></div>
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><Users className="h-5 w-5 text-secondary" /></div>
                </div>
              </CardContent></Card>
            </motion.div>
            <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.35 }}>
              <Card className="stat-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"><CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs text-muted-foreground font-medium">Customer Debt</p><p className="text-xl font-bold text-destructive"><AnimatedCounter value={totalDebt} prefix="KSh " /></p></div>
                  <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><CreditCard className="h-5 w-5 text-destructive" /></div>
                </div>
              </CardContent></Card>
            </motion.div>
          </>
        )}
      </div>

      {/* Performance Analysis - admin only */}
      {isAdmin && (
        <Card className={profitMismatch ? "border-destructive/40 bg-destructive/5" : "border-success/30 bg-success/5"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {profitMismatch ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <TrendingUp className="h-4 w-4 text-success" />}
              Performance Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Expected Profit (Stock Margin)</p>
                <p className="text-lg font-bold text-foreground">KSh {expectedProfit.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Actual Monthly Profit</p>
                <p className="text-lg font-bold text-foreground">KSh {monthProfit.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Difference</p>
                <p className={`text-lg font-bold ${profitDiff >= 0 ? "text-success" : "text-destructive"}`}>
                  {profitDiff >= 0 ? "+" : ""}KSh {profitDiff.toLocaleString()}
                </p>
              </div>
            </div>
            {profitMismatch && (
              <div className="mt-3 bg-destructive/10 rounded-lg p-3 text-sm text-destructive">
                <p className="font-semibold">⚠️ Profit mismatch detected</p>
                <p className="text-xs mt-1">Possible causes: stock loss, theft, incorrect entries, or unsold discounted items.</p>
              </div>
            )}
            {!profitMismatch && expectedProfit > 0 && (
              <div className="mt-3 bg-success/10 rounded-lg p-3 text-sm text-success">
                <p className="font-semibold">✅ Profit is accurate — within expected range</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts - admin/supervisor only */}
      {isAdmin && (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Revenue vs Purchases (7 Days)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={last7Days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(210,20%,88%)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(220,10%,45%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(220,10%,45%)" />
                    <Tooltip formatter={(v: number) => `KSh ${v.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="Revenue" stroke="hsl(195,85%,55%)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Purchases" stroke="hsl(0,72%,51%)" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Profit" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Breakdown (This Month)</CardTitle></CardHeader>
              <CardContent>
                {paymentData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">No sales this month yet.</p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={180}>
                      <PieChart>
                        <Pie data={paymentData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => `KSh ${v.toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 text-sm">
                      {paymentData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span>{d.name}: <strong>KSh {d.value.toLocaleString()}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {stockData.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Stock Levels</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stockData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(210,20%,88%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(220,10%,45%)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(220,10%,45%)" />
                    <Tooltip />
                    <Bar dataKey="Stock" fill="hsl(195,85%,55%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Threshold" fill="hsl(0,72%,51%)" radius={[4, 4, 0, 0]} opacity={0.4} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Low stock alerts */}
      {lowStockProducts.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lowStockProducts.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{p.name} ({p.bottle_size})</span>
                <Badge variant="destructive">{p.quantity} left</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Customer debt - not for stock managers */}
      {!isStockMgr && debtCustomers.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-warning">
              <CreditCard className="h-4 w-4" /> Customer Debt Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {debtCustomers.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{c.name}</span>
                <Badge variant="destructive">KSh {c.credit_balance.toLocaleString()}</Badge>
              </div>
            ))}
            {debtCustomers.length > 5 && <p className="text-xs text-muted-foreground">+ {debtCustomers.length - 5} more</p>}
          </CardContent>
        </Card>
      )}

      {/* Monthly summary - admin only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Monthly Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div><p className="text-muted-foreground">Revenue</p><p className="text-lg font-bold">KSh {monthRevenue.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">Purchases</p><p className="text-lg font-bold">KSh {monthPurchaseTotal.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">Profit</p><p className="text-lg font-bold text-success">KSh {monthProfit.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">Sales Count</p><p className="text-lg font-bold">{monthSales.length}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity - admin only */}
      {isAdmin && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent Sales</CardTitle></CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No sales recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentSales.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{s.product_name} × {s.quantity}</p>
                        <p className="text-xs text-muted-foreground">{s.customer_name || "Walk-in"} · {format(new Date(s.date), "dd MMM, HH:mm")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">KSh {s.final_amount.toLocaleString()}</p>
                        <Badge variant="outline" className="text-[10px]">{s.payment_mode}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent Purchases</CardTitle></CardHeader>
            <CardContent>
              {recentPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No purchases recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentPurchases.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                      <div>
                        <p className="font-medium text-foreground">{p.product_name} × {p.quantity}</p>
                        <p className="text-xs text-muted-foreground">{p.supplier_name} · {format(new Date(p.date), "dd MMM, HH:mm")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">KSh {p.total_cost.toLocaleString()}</p>
                        <Badge variant="outline" className="text-[10px]">{p.payment_mode}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* Notification Dialog for new Important/Critical announcements */}
      <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              New Company Announcement
            </DialogTitle>
          </DialogHeader>
          {notifAnnouncement && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={`text-[10px] ${notifAnnouncement.priority === "Critical" ? "bg-destructive/15 text-destructive" : "bg-yellow-500/15 text-yellow-600"}`}>
                  {notifAnnouncement.priority}
                </Badge>
                <span className="font-semibold text-sm text-foreground">{notifAnnouncement.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{notifAnnouncement.message}</p>
              <div className="flex gap-2 pt-2">
                <Link to="/app/announcements" onClick={() => setNotifOpen(false)}>
                  <Button size="sm">Read Now</Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => setNotifOpen(false)}>Later</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </AnimatedPage>
  );
}


