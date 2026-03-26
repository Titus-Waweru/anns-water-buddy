import { useMemo } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, TrendingUp, AlertTriangle, DollarSign, ArrowDownCircle, Users, CreditCard } from "lucide-react";
import { format, isToday, startOfMonth, isAfter, subDays, startOfDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";

const COLORS = ["hsl(195,85%,55%)", "hsl(142,71%,45%)", "hsl(38,92%,50%)", "hsl(0,72%,51%)", "hsl(220,70%,22%)"];

export default function Dashboard() {
  const { products, sales, purchases, customers } = useData();
  const { profile } = useAuth();

  const todaySales = sales.filter(s => isToday(new Date(s.date)));
  const todayPurchases = purchases.filter(p => isToday(new Date(p.date)));
  const monthStart = startOfMonth(new Date());
  const monthSales = sales.filter(s => isAfter(new Date(s.date), monthStart));
  const monthPurchases = purchases.filter(p => isAfter(new Date(p.date), monthStart));

  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.final_amount, 0);
  const todayPurchasesTotal = todayPurchases.reduce((sum, p) => sum + p.total_cost, 0);
  const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
  const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.final_amount, 0);
  const monthPurchaseTotal = monthPurchases.reduce((sum, p) => sum + p.total_cost, 0);
  const totalInventory = products.reduce((sum, p) => sum + p.quantity, 0);
  const lowStockProducts = products.filter(p => p.quantity <= p.low_stock_threshold);
  const totalDebt = customers.reduce((sum, c) => sum + c.credit_balance, 0);
  const debtCustomers = customers.filter(c => c.credit_balance > 0);

  // Revenue vs Purchases - last 7 days
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

  // Payment breakdown
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

  // Stock levels - top products
  const stockData = useMemo(() => {
    return products.slice(0, 10).map(p => ({
      name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name,
      Stock: p.quantity,
      Threshold: p.low_stock_threshold,
    }));
  }, [products]);

  const recentSales = sales.slice(0, 5);
  const recentPurchases = purchases.slice(0, 5);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting()}, {profile?.full_name?.split(" ")[0] || "there"} 👋</h1>
        <p className="text-muted-foreground text-sm">Here's your Wonder Aqua overview</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Today's Sales</p><p className="text-xl font-bold text-foreground">KSh {todaySalesTotal.toLocaleString()}</p></div>
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><ShoppingCart className="h-5 w-5 text-secondary" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Today's Purchases</p><p className="text-xl font-bold text-foreground">KSh {todayPurchasesTotal.toLocaleString()}</p></div>
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><ArrowDownCircle className="h-5 w-5 text-secondary" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Today's Profit</p><p className="text-xl font-bold text-success">KSh {todayProfit.toLocaleString()}</p></div>
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><TrendingUp className="h-5 w-5 text-success" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Monthly Profit</p><p className="text-xl font-bold text-success">KSh {monthProfit.toLocaleString()}</p></div>
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><DollarSign className="h-5 w-5 text-success" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Inventory</p><p className="text-xl font-bold text-foreground">{totalInventory} bottles</p></div>
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><Package className="h-5 w-5 text-secondary" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Low Stock</p><p className="text-xl font-bold text-destructive">{lowStockProducts.length} items</p></div>
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Customers</p><p className="text-xl font-bold text-foreground">{customers.length}</p></div>
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center"><Users className="h-5 w-5 text-secondary" /></div>
          </div>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground font-medium">Customer Debt</p><p className="text-xl font-bold text-destructive">KSh {totalDebt.toLocaleString()}</p></div>
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><CreditCard className="h-5 w-5 text-destructive" /></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Revenue vs Purchases - 7 days */}
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

        {/* Payment breakdown */}
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

      {/* Stock levels chart */}
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

      {/* Customer debt overview */}
      {debtCustomers.length > 0 && (
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

      {/* Monthly summary */}
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

      {/* Recent activity */}
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
    </div>
  );
}
