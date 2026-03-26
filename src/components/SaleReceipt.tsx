import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import logo from "@/assets/logo.jpg";

interface ReceiptData {
  id: string;
  customerName: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  paymentMode: string;
  profit: number;
  loyaltyPoints: number;
  date: string;
}

interface SaleReceiptProps {
  data: ReceiptData;
  onClose: () => void;
}

export default function SaleReceipt({ data, onClose }: SaleReceiptProps) {
  const handlePrint = () => {
    const printContent = document.getElementById("receipt-content");
    if (!printContent) return;
    const win = window.open("", "_blank", "width=300,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .logo { width: 60px; height: 60px; border-radius: 8px; display: block; margin: 0 auto 4px; }
        @media print { body { width: 100%; } }
      </style></head><body>
      ${printContent.innerHTML}
      <script>window.print();window.close();<\/script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="space-y-4">
      <div id="receipt-content" className="font-mono text-xs space-y-2 bg-background p-4 rounded-lg border">
        <div className="text-center">
          <img src={logo} alt="Logo" className="w-14 h-14 rounded-lg mx-auto mb-1 object-cover" />
          <p className="font-bold text-sm">WONDER AQUA LTD</p>
          <p className="text-muted-foreground">Water Distribution</p>
          <div className="border-t border-dashed border-foreground/30 my-2" />
        </div>

        <div className="text-center text-muted-foreground">
          <p>Receipt #{data.id.slice(0, 8).toUpperCase()}</p>
          <p>{format(new Date(data.date), "dd MMM yyyy, HH:mm")}</p>
        </div>

        <div className="border-t border-dashed border-foreground/30 my-2" />

        <p><span className="text-muted-foreground">Customer:</span> {data.customerName}</p>

        <div className="border-t border-dashed border-foreground/30 my-2" />

        <div className="flex justify-between font-bold">
          <span>Item</span><span>Amount</span>
        </div>
        <div className="flex justify-between">
          <span>{data.productName} × {data.quantity}</span>
          <span>KSh {data.totalAmount.toLocaleString()}</span>
        </div>

        {data.discountAmount > 0 && (
          <div className="flex justify-between text-destructive">
            <span>Discount</span>
            <span>-KSh {data.discountAmount.toLocaleString()}</span>
          </div>
        )}

        <div className="border-t border-dashed border-foreground/30 my-2" />

        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>KSh {data.finalAmount.toLocaleString()}</span>
        </div>

        <div className="flex justify-between">
          <span>Payment</span>
          <span>{data.paymentMode}</span>
        </div>

        {data.loyaltyPoints > 0 && (
          <div className="flex justify-between text-primary">
            <span>Loyalty Points Earned</span>
            <span>+{data.loyaltyPoints}</span>
          </div>
        )}

        <div className="border-t border-dashed border-foreground/30 my-2" />

        <div className="text-center text-muted-foreground">
          <p>Thank you for your business!</p>
          <p>Wonder Aqua LTD</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handlePrint} className="flex-1 gap-2">
          <Printer className="h-4 w-4" /> Print Receipt
        </Button>
        <Button variant="outline" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
