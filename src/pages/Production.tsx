import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Factory, Package, AlertTriangle, CheckCircle } from "lucide-react";

interface ProductionResult {
  totalBottles: number;
  goodBottles: number;
  faultyBottles: number;
  economyPacks: number;
  executivePacks: number;
  looseBottles: number;
}

export default function Production() {
  const { hasRole, isAdmin } = useAuth();
  const canAccess = isAdmin || hasRole("stock_manager");

  const [bales, setBales] = useState(0);
  const [faultyBottles, setFaultyBottles] = useState(0);
  const [bottlesPerBale] = useState(90);
  const [bottlesPerPack] = useState(12);
  const [economyAllocation, setEconomyAllocation] = useState(50); // percentage
  const [result, setResult] = useState<ProductionResult | null>(null);

  if (!canAccess) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        You don't have permission to access Production.
      </div>
    );
  }

  const calculate = () => {
    if (bales <= 0) return;

    const totalBottles = bales * bottlesPerBale;
    const goodBottles = Math.max(0, totalBottles - faultyBottles);
    const economyBottles = Math.floor(goodBottles * (economyAllocation / 100));
    const executiveBottles = goodBottles - economyBottles;
    const economyPacks = Math.floor(economyBottles / bottlesPerPack);
    const executivePacks = Math.floor(executiveBottles / bottlesPerPack);
    const looseBottles = economyBottles % bottlesPerPack + executiveBottles % bottlesPerPack;

    setResult({
      totalBottles,
      goodBottles,
      faultyBottles,
      economyPacks,
      executivePacks,
      looseBottles,
    });
  };

  const reset = () => {
    setBales(0);
    setFaultyBottles(0);
    setEconomyAllocation(50);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Factory className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Production Calculator</h1>
          <p className="text-sm text-muted-foreground">Calculate bottling output from bales</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Input */}
        <Card>
          <CardHeader><CardTitle className="text-base">Input</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Number of Bales Received</Label>
              <Input type="number" min={0} value={bales || ""} onChange={e => setBales(Number(e.target.value))} placeholder="e.g. 10" />
              <p className="text-xs text-muted-foreground mt-1">1 bale = {bottlesPerBale} bottles</p>
            </div>
            <div>
              <Label>Faulty / Reject Bottles</Label>
              <Input type="number" min={0} value={faultyBottles || ""} onChange={e => setFaultyBottles(Number(e.target.value))} placeholder="e.g. 5" />
            </div>
            <div>
              <Label>Economy Allocation (%)</Label>
              <Input type="number" min={0} max={100} value={economyAllocation} onChange={e => setEconomyAllocation(Math.min(100, Math.max(0, Number(e.target.value))))} />
              <p className="text-xs text-muted-foreground mt-1">Remaining {100 - economyAllocation}% goes to Executive</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={calculate} className="flex-1">Calculate</Button>
              <Button variant="outline" onClick={reset}>Reset</Button>
            </div>
          </CardContent>
        </Card>

        {/* Output */}
        <Card className={result ? "border-primary/30" : ""}>
          <CardHeader><CardTitle className="text-base">Output</CardTitle></CardHeader>
          <CardContent>
            {!result ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Enter bales and calculate</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-foreground">{result.totalBottles}</p>
                    <p className="text-xs text-muted-foreground">Total Bottles</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-success">{result.goodBottles}</p>
                    <p className="text-xs text-muted-foreground">Good Bottles</p>
                  </div>
                </div>

                {result.faultyBottles > 0 && (
                  <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{result.faultyBottles} faulty/reject bottles excluded</span>
                  </div>
                )}

                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-semibold text-foreground">Packing Summary (1 pack = {bottlesPerPack} bottles)</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Economy Packs</span>
                    </div>
                    <Badge variant="secondary" className="text-base">{result.economyPacks}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Executive Packs</span>
                    </div>
                    <Badge variant="secondary" className="text-base">{result.executivePacks}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Loose Bottles</span>
                    </div>
                    <Badge variant="outline">{result.looseBottles}</Badge>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-foreground">Total Sellable</p>
                  <p className="text-muted-foreground">
                    {result.economyPacks + result.executivePacks} packs + {result.looseBottles} loose = <strong>{result.goodBottles} bottles</strong>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
