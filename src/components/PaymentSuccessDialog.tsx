import { CheckCircle2, Printer } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export interface PaymentSuccessData {
  amount: number;
  reference: string;
  date: string;
  method?: string;
  customerName?: string;
}

interface Props {
  data: PaymentSuccessData | null;
  onClose: () => void;
  onPrintReceipt?: () => void;
}

export default function PaymentSuccessDialog({ data, onClose, onPrintReceipt }: Props) {
  return (
    <Dialog open={!!data} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm text-center">
        {data && (
          <div className="space-y-5 py-2">
            <div className="flex justify-center">
              <div className="rounded-full bg-emerald-500/10 p-4 ring-8 ring-emerald-500/5 animate-in zoom-in-75 duration-300">
                <CheckCircle2 className="h-16 w-16 text-emerald-500" strokeWidth={1.75} />
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Payment Successful</h2>
              <p className="text-sm text-muted-foreground">
                Payment of{" "}
                <span className="font-semibold text-foreground">
                  KSh {Number(data.amount).toLocaleString()}
                </span>{" "}
                received successfully.
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 space-y-3 text-left">
              <Row label="Amount Paid" value={`KSh ${Number(data.amount).toLocaleString()}`} strong />
              <Row label="Reference" value={data.reference} mono />
              {data.method && <Row label="Method" value={data.method} />}
              {data.customerName && <Row label="Customer" value={data.customerName} />}
              <Row label="Date & Time" value={format(new Date(data.date), "dd MMM yyyy, HH:mm")} />
            </div>

            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-500">
              Sale has been completed successfully.
            </p>

            <div className="flex gap-2">
              {onPrintReceipt && (
                <Button variant="outline" className="flex-1 gap-2" onClick={onPrintReceipt}>
                  <Printer className="h-4 w-4" /> Receipt
                </Button>
              )}
              <Button className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right break-all ${mono ? "font-mono text-xs" : ""} ${
          strong ? "font-bold text-foreground" : "font-medium text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
