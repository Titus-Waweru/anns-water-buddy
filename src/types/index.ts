export interface Product {
  id: string;
  name: string;
  bottleSize: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  lowStockThreshold: number;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  creditBalance: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  location: string;
  notes: string;
  createdAt: string;
}

export type PaymentMode = "Cash" | "Mpesa" | "Credit";
export type DiscountType = "percentage" | "fixed";

export interface Sale {
  id: string;
  customerId?: string;
  customerName?: string;
  productId: string;
  productName: string;
  quantity: number;
  sellingPrice: number;
  buyingPrice: number;
  discountType?: DiscountType;
  discountValue: number;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  profit: number;
  paymentMode: PaymentMode;
  date: string;
}

export interface Purchase {
  id: string;
  supplierId?: string;
  supplierName: string;
  productId: string;
  productName: string;
  quantity: number;
  buyingPrice: number;
  totalCost: number;
  paymentMode: PaymentMode;
  date: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  type: "IN" | "OUT";
  quantity: number;
  reference: string;
  date: string;
}
