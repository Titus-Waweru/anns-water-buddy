import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import logo from "@/assets/logo.jpg";

interface CartItemReceipt {
  productName: string;
  quantity: number;
  sellingPrice: number;
  subtotal: number;
}

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
  totalLoyaltyPoints?: number;
  mpesaReceipt?: string | null;
  cashierName?: string | null;
  cashierId?: string | null;
  branchName?: string | null;
  items?: CartItemReceipt[];
  totalCost?: number;
  expectedProfit?: number;
  loyaltyPointsEarned?: number;
  amountPaid?: number;
  balance?: number;
  date: string;
}

interface SaleReceiptProps {
  data: ReceiptData;
  onClose: () => void;
}

/**
 * 80mm thermal receipt. The print window contains ONLY the receipt HTML so
 * nothing else is pushed to the printer, and page size is fixed to 80mm to
 * prevent extra blank pages.
 */
export default function SaleReceipt({ data, onClose }: SaleReceiptProps) {
  const hasItems = data.items && data.items.length > 0;
  const logoSrc = typeof window !== "undefined" && logo.startsWith("/")
    ? `${window.location.origin}${logo}`
    : logo;

  const amountPaid =
    typeof data.amountPaid === "number"
      ? data.amountPaid
      : data.paymentMode === "Credit"
        ? 0
        : data.finalAmount;
  const balance =
    typeof data.balance === "number" ? data.balance : Math.max(0, data.finalAmount - amountPaid);

  const handlePrint = () => {
    const printContent = document.getElementById("receipt-content");
    if (!printContent) return;
    const win = window.open("", "_blank", "width=320,height=600");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; font-size: 12px;
               width: 72mm; margin: 0 auto; padding: 2mm 2mm 4mm; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: 700; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .sm { font-size: 11px; }
        .lg { font-size: 14px; }
        .logo { display: block; margin: 0 auto 2px; width: 18mm; height: auto;
                filter: grayscale(100%) contrast(140%); }
        h1,h2,h3,p { margin: 0; padding: 0; }
        @media print { body { width: 72mm; } }
      </style></head><body>
      ${printContent.innerHTML}
      <script>window.onload=function(){setTimeout(function(){window.print();setTimeout(function(){window.close();},300);},250);};<\/script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-4">
      <div
        id="receipt-content"
        className="font-mono text-xs bg-background p-3 rounded-lg border max-w-[300px] mx-auto"
      >
        <img src={logoSrc} alt="Wonder Aqua" className="logo" width={68} />
        <div className="center bold lg">WONDER AQUA LTD</div>
        <div className="center sm">Refreshing. Trusted. Wonder.</div>
        <div className="center sm">P.O BOX 455-00520 RUAI</div>
        <div className="center sm">Tel: 0715670632</div>
        <div className="line" />

        <div className="row sm">
          <span>Receipt</span>
          <span>#{data.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="row sm">
          <span>Date</span>
          <span>{format(new Date(data.date), "dd/MM/yy HH:mm")}</span>
        </div>
        {data.branchName && (
          <div className="row sm">
            <span>Branch</span>
            <span>{data.branchName}</span>
          </div>
        )}
        {data.customerName && data.customerName !== "Walk-in" && (
          <div className="row sm">
            <span>Customer</span>
            <span>{data.customerName}</span>
          </div>
        )}

        <div className="line" />

        {hasItems ? (
          <>
            {data.items!.map((item, idx) => (
              <div key={idx}>
                <div className="row">
                  <span>{item.productName} x{item.quantity}</span>
                  <span>{item.subtotal.toLocaleString()}</span>
                </div>
                <div className="row sm">
                  <span>@ {item.sellingPrice.toLocaleString()}</span>
                  <span />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="row bold">
              <span>Item</span>
              <span>Amount</span>
            </div>
            <div className="row">
              <span>
                {data.productName} x{data.quantity}
              </span>
              <span>{data.totalAmount.toLocaleString()}</span>
            </div>
            <div className="row sm">
              <span>@ {data.sellingPrice.toLocaleString()}</span>
              <span />
            </div>
          </>
        )}

        <div className="line" />

        <div className="row">
          <span>Subtotal</span>
          <span>{data.totalAmount.toLocaleString()}</span>
        </div>
        {data.discountAmount > 0 && (
          <div className="row">
            <span>Discount</span>
            <span>-{data.discountAmount.toLocaleString()}</span>
          </div>
        )}

        <div className="row bold lg">
          <span>TOTAL</span>
          <span>KSh {data.finalAmount.toLocaleString()}</span>
        </div>

        <div className="row">
          <span>Amount Paid</span>
          <span>KSh {amountPaid.toLocaleString()}</span>
        </div>
        <div className="row">
          <span>Balance</span>
          <span>KSh {balance.toLocaleString()}</span>
        </div>

        <div className="line" />

        <div className="row">
          <span>Payment</span>
          <span>{data.paymentMode}</span>
        </div>
        {data.mpesaReceipt && (
          <div className="row sm">
            <span>M-Pesa Code</span>
            <span>{data.mpesaReceipt}</span>
          </div>
        )}

        <div className="line" />
        <div className="sm bold">Served By:</div>
        <div className="sm">{data.cashierName || "—"}</div>
        {data.cashierId && <div className="sm">Employee ID: {data.cashierId}</div>}

        {(data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0) || (typeof data.totalLoyaltyPoints === "number") ? (
          <>
            <div className="line" />
            {data.loyaltyPointsEarned !== undefined && data.loyaltyPointsEarned > 0 && (
              <div className="row sm">
                <span>Points Earned</span>
                <span>+{data.loyaltyPointsEarned}</span>
              </div>
            )}
            {typeof data.totalLoyaltyPoints === "number" && (
              <div className="row sm">
                <span>Loyalty Balance</span>
                <span>{data.totalLoyaltyPoints}</span>
              </div>
            )}
          </>
        ) : (
          data.loyaltyPoints > 0 && (
            <>
              <div className="line" />
              <div className="row sm">
                <span>Points earned</span>
                <span>+{data.loyaltyPoints}</span>
              </div>
              {typeof data.totalLoyaltyPoints === "number" && (
                <div className="row sm">
                  <span>Points balance</span>
                  <span>{data.totalLoyaltyPoints}</span>
                </div>
              )}
            </>
          )
        )}

        <div className="line" />
        <div className="center sm bold">Thank you for choosing Wonder Aqua.</div>
        <div className="center sm">We look forward to serving you again.</div>
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
