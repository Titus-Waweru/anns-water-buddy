import { useData } from "@/context/DataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isToday, startOfMonth, isAfter, format } from "date-fns";

export default function Reports() {
  const { sales, purchases, products } = useData();

  const today = new Date();
  const monthStart = startOfMonth(today);

  const todaySales = sales.filter(s => isToday(new Date(s.date)));
  const monthSales = sales.filter(s => isAfter(new Date(s.date), monthStart));
  const allProfit = sales.reduce((sum, s) => sum + s.profit, 0);

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.final_amount, 0);
  const todayProfit = todaySales.reduce((sum, s) => sum + s.profit, 0);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.final_amount, 0);
  const monthProfit = monthSales.reduce((sum, s) => sum + s.profit, 0);

  const paymentTotals = { Cash: 0, Mpesa: 0, Credit: 0 };
  sales.forEach(s => { paymentTotals[s.payment_mode] += s.final_amount; });
  purchases.forEach(p => { paymentTotals[p.payment_mode] += p.total_cost; });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Business performance summary</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Today — {format(today, "dd MMM yyyy")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sales Count</span><span className="font-medium">{todaySales.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-medium">KSh {todayRevenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className="font-bold text-success">KSh {todayProfit.toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">This Month — {format(today, "MMMM yyyy")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sales Count</span><span className="font-medium">{monthSales.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="font-medium">KSh {monthRevenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Profit</span><span className="font-bold text-success">KSh {monthProfit.toLocaleString()}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">All-Time Profit</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-success">KSh {allProfit.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">From {sales.length} total sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Mode Totals</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cash</span><span className="font-medium">KSh {paymentTotals.Cash.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mpesa</span><span className="font-medium">KSh {paymentTotals.Mpesa.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Credit</span><span className="font-medium">KSh {paymentTotals.Credit.toLocaleString()}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Inventory Levels</CardTitle></CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products in inventory.</p>
          ) : (
            <div className="space-y-3">
              {products.map(p => {
                const pct = p.low_stock_threshold > 0 ? Math.min(100, (p.quantity / (p.low_stock_threshold * 5)) * 100) : 50;
                const isLow = p.quantity <= p.low_stock_threshold;
                return (
                  <div key={p.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{p.name} ({p.bottle_size})</span>
                      <span className={isLow ? "text-destructive font-bold" : "text-foreground"}>{p.quantity} units</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isLow ? "bg-destructive" : "bg-secondary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
