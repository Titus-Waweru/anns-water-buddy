import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingCart, TrendingUp, AlertTriangle, DollarSign, ArrowDownCircle } from "lucide-react";
import { format, isToday, startOfMonth, isAfter } from "date-fns";

export default function Dashboard() {
  const { products, sales, purchases } = useData();
  const { profile } = useAuth();

  const todaySales = sales.filter(s => isToday(new Date(s.date)));
  const todayPurchases = purchases.filter(p => isToday(new Date(p.date)));
  const monthStart = startOfMonth(new Date());
  const monthSales = sales.filter(s => isAfter(new Date(s.date), monthStart));

  const todaySalesTotal = todaySales.reduce((sum, s) => sum + s.final_amount, 0);
  const todayPurchasesTotal = todayPurchases.reduce((sum, p) => sum + p.total_cost, 0);
  const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
  const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);
  const totalInventory = products.reduce((sum, p) => sum + p.quantity, 0);
  const lowStockProducts = products.filter(p => p.quantity <= p.low_stock_threshold);

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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Today's Sales</p>
                <p className="text-xl font-bold text-foreground">KSh {todaySalesTotal.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Today's Purchases</p>
                <p className="text-xl font-bold text-foreground">KSh {tod	ayPurchasesTotal.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <ArrowDownCircle className="h-5 w-5 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Inventory</p>
                <p className="text-xl font-bold text-foreground">{totalInventory} bottles</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <Package className="h-5 w-5 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Today's Profit</p>
                <p className="text-xl font-bold text-success">KSh {todayProfit.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Monthly Profit</p>
                <p className="text-xl font-bold text-success">KSh {monthProfit.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Low Stock</p>
                <p className="text-xl font-bold text-destructive">{lowStockProducts.length} items</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Sales</CardTitle>
          </CardHeader>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Recent Purchases</CardTitle>
          </CardHeader>
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
