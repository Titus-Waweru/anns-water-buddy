import { useState } from "react";
import { useData } from "@/context/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { FileText } from "lucide-react";

type FilterType = "all" | "sale" | "purchase";

export default function Transactions() {
  const { sales, purchases } = useData();
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [dateFilter, setDateFilter] = useState("");

  type Transaction = { id: string; type: "Sale" | "Purchase"; productName: string; quantity: number; amount: number; profit?: number; person: string; paymentMode: string; date: string };

  const all: Transaction[] = [
    ...sales.map(s => ({ id: s.id, type: "Sale" as const, productName: s.product_name, quantity: s.quantity, amount: s.final_amount, profit: s.profit, person: s.customer_name || "Walk-in", paymentMode: s.payment_mode, date: s.date })),
    ...purchases.map(p => ({ id: p.id, type: "Purchase" as const, productName: p.product_name, quantity: p.quantity, amount: p.total_cost, person: p.supplier_name, paymentMode: p.payment_mode, date: p.date })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = all.filter(t => {
    if (typeFilter === "sale" && t.type !== "Sale") return false;
    if (typeFilter === "purchase" && t.type !== "Purchase") return false;
    if (dateFilter && !t.date.startsWith(dateFilter)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Transaction History</h1>
        <p className="text-sm text-muted-foreground">View all sales and purchase records</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as FilterType)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="purchase">Purchases</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-40" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No transactions found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <Card key={t.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.type === "Sale" ? "default" : "secondary"} className={t.type === "Sale" ? "bg-success" : ""}>{t.type}</Badge>
                    <span className="font-medium text-foreground text-sm">{t.productName} × {t.quantity}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t.person} · {format(new Date(t.date), "dd MMM yyyy, HH:mm")} · {t.paymentMode}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground">KSh {t.amount.toLocaleString()}</p>
                  {t.profit !== undefined && <p className="text-xs text-success">Profit: KSh {t.profit.toLocaleString()}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
