import { forwardRef } from "react";
import { format } from "date-fns";
import logo from "@/assets/logo.jpg";

interface InvoiceItem {
  product_name: string;
  quantity: number;
  selling_price: number;
  final_amount: number;
  date: string;
}

interface InvoicePDFProps {
  customer: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    credit_balance: number;
  };
  items: InvoiceItem[];
  invoiceNumber: string;
}

const InvoicePDF = forwardRef<HTMLDivElement, InvoicePDFProps>(
  ({ customer, items, invoiceNumber }, ref) => {
    const totalAmount = items.reduce((sum, item) => sum + item.final_amount, 0);

    return (
      <div ref={ref} className="bg-white text-gray-900 p-8 max-w-[210mm] mx-auto" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-blue-600 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Wonder Aqua" className="h-16 w-16 rounded-xl object-cover" />
            <div>
              <h1 className="text-2xl font-bold text-blue-900">WONDER AQUA LTD</h1>
              <p className="text-xs text-gray-500">Water Distribution & Management</p>
              <p className="text-xs text-gray-500">www.wonderaqua.co.ke</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-blue-600">INVOICE</h2>
            <p className="text-sm text-gray-600 mt-1">#{invoiceNumber}</p>
            <p className="text-sm text-gray-600">Date: {format(new Date(), "dd/MM/yyyy")}</p>
          </div>
        </div>

        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bill To</h3>
            <p className="font-semibold text-lg">{customer.name}</p>
            {customer.phone && <p className="text-sm text-gray-600">📞 {customer.phone}</p>}
            {customer.email && <p className="text-sm text-gray-600">✉️ {customer.email}</p>}
            {customer.address && <p className="text-sm text-gray-600">📍 {customer.address}</p>}
          </div>
          <div className="text-right">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Payment Status</h3>
            <span className="inline-block bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
              Outstanding
            </span>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-6">
          <thead>
            <tr className="bg-blue-50">
              <th className="text-left py-3 px-4 text-xs font-bold text-blue-900 uppercase">#</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-blue-900 uppercase">Item</th>
              <th className="text-center py-3 px-4 text-xs font-bold text-blue-900 uppercase">Date</th>
              <th className="text-center py-3 px-4 text-xs font-bold text-blue-900 uppercase">Qty</th>
              <th className="text-right py-3 px-4 text-xs font-bold text-blue-900 uppercase">Price</th>
              <th className="text-right py-3 px-4 text-xs font-bold text-blue-900 uppercase">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="py-2.5 px-4 text-sm text-gray-600">{i + 1}</td>
                <td className="py-2.5 px-4 text-sm font-medium">{item.product_name}</td>
                <td className="py-2.5 px-4 text-sm text-center text-gray-600">{format(new Date(item.date), "dd/MM/yy")}</td>
                <td className="py-2.5 px-4 text-sm text-center">{item.quantity}</td>
                <td className="py-2.5 px-4 text-sm text-right">KSh {item.selling_price.toLocaleString()}</td>
                <td className="py-2.5 px-4 text-sm text-right font-semibold">KSh {item.final_amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">KSh {totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t-2 border-blue-600 pt-2">
              <span>Outstanding Balance:</span>
              <span className="text-red-600">KSh {customer.credit_balance.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Payment Instructions */}
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-sm text-blue-900 mb-2">Payment Instructions</h3>
          <div className="text-sm text-gray-700 space-y-1">
            <p>• <strong>M-Pesa:</strong> Send payment to Wonder Aqua LTD business number</p>
            <p>• <strong>Cash:</strong> Pay at any Wonder Aqua branch location</p>
            <p>• Please include your name as reference when making payment</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-4 text-center text-xs text-gray-400">
          <p>Thank you for your business!</p>
          <p className="mt-1">Wonder Aqua LTD · www.wonderaqua.co.ke · Generated on {format(new Date(), "dd MMMM yyyy, HH:mm")}</p>
        </div>
      </div>
    );
  }
);

InvoicePDF.displayName = "InvoicePDF";

export default InvoicePDF;
