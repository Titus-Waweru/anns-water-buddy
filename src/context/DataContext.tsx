import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Product, Customer, Supplier, Sale, Purchase, InventoryLog } from "@/types";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

interface DataContextType {
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  inventoryLogs: InventoryLog[];

  addProduct: (p: Omit<Product, "id" | "createdAt">) => void;
  updateProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;

  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => void;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  addSupplier: (s: Omit<Supplier, "id" | "createdAt">) => void;
  updateSupplier: (s: Supplier) => void;
  deleteSupplier: (id: string) => void;

  addSale: (s: Omit<Sale, "id">) => void;
  addPurchase: (p: Omit<Purchase, "id">) => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => loadFromStorage("wbm_products", []));
  const [customers, setCustomers] = useState<Customer[]>(() => loadFromStorage("wbm_customers", []));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadFromStorage("wbm_suppliers", []));
  const [sales, setSales] = useState<Sale[]>(() => loadFromStorage("wbm_sales", []));
  const [purchases, setPurchases] = useState<Purchase[]>(() => loadFromStorage("wbm_purchases", []));
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>(() => loadFromStorage("wbm_inventory_logs", []));

  useEffect(() => saveToStorage("wbm_products", products), [products]);
  useEffect(() => saveToStorage("wbm_customers", customers), [customers]);
  useEffect(() => saveToStorage("wbm_suppliers", suppliers), [suppliers]);
  useEffect(() => saveToStorage("wbm_sales", sales), [sales]);
  useEffect(() => saveToStorage("wbm_purchases", purchases), [purchases]);
  useEffect(() => saveToStorage("wbm_inventory_logs", inventoryLogs), [inventoryLogs]);

  const addProduct = useCallback((p: Omit<Product, "id" | "createdAt">) => {
    setProducts(prev => [...prev, { ...p, id: generateId(), createdAt: new Date().toISOString() }]);
  }, []);

  const updateProduct = useCallback((p: Product) => {
    setProducts(prev => prev.map(x => x.id === p.id ? p : x));
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(x => x.id !== id));
  }, []);

  const addCustomer = useCallback((c: Omit<Customer, "id" | "createdAt">) => {
    setCustomers(prev => [...prev, { ...c, id: generateId(), createdAt: new Date().toISOString() }]);
  }, []);

  const updateCustomer = useCallback((c: Customer) => {
    setCustomers(prev => prev.map(x => x.id === c.id ? c : x));
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prev => prev.filter(x => x.id !== id));
  }, []);

  const addSupplier = useCallback((s: Omit<Supplier, "id" | "createdAt">) => {
    setSuppliers(prev => [...prev, { ...s, id: generateId(), createdAt: new Date().toISOString() }]);
  }, []);

  const updateSupplier = useCallback((s: Supplier) => {
    setSuppliers(prev => prev.map(x => x.id === s.id ? s : x));
  }, []);

  const deleteSupplier = useCallback((id: string) => {
    setSuppliers(prev => prev.filter(x => x.id !== id));
  }, []);

  const addSale = useCallback((s: Omit<Sale, "id">) => {
    const sale: Sale = { ...s, id: generateId() };
    setSales(prev => [...prev, sale]);

    // Reduce inventory
    setProducts(prev => prev.map(p =>
      p.id === s.productId ? { ...p, quantity: Math.max(0, p.quantity - s.quantity) } : p
    ));

    // Log
    setInventoryLogs(prev => [...prev, {
      id: generateId(),
      productId: s.productId,
      productName: s.productName,
      type: "OUT",
      quantity: s.quantity,
      reference: `Sale to ${s.customerName || "Walk-in"}`,
      date: s.date,
    }]);

    // Update customer credit
    if (s.paymentMode === "Credit" && s.customerId) {
      setCustomers(prev => prev.map(c =>
        c.id === s.customerId ? { ...c, creditBalance: c.creditBalance + s.finalAmount } : c
      ));
    }
  }, []);

  const addPurchase = useCallback((p: Omit<Purchase, "id">) => {
    const purchase: Purchase = { ...p, id: generateId() };
    setPurchases(prev => [...prev, purchase]);

    // Increase inventory
    setProducts(prev => prev.map(prod =>
      prod.id === p.productId ? { ...prod, quantity: prod.quantity + p.quantity, buyingPrice: p.buyingPrice } : prod
    ));

    // Log
    setInventoryLogs(prev => [...prev, {
      id: generateId(),
      productId: p.productId,
      productName: p.productName,
      type: "IN",
      quantity: p.quantity,
      reference: `Purchase from ${p.supplierName}`,
      date: p.date,
    }]);
  }, []);

  return (
    <DataContext.Provider value={{
      products, customers, suppliers, sales, purchases, inventoryLogs,
      addProduct, updateProduct, deleteProduct,
      addCustomer, updateCustomer, deleteCustomer,
      addSupplier, updateSupplier, deleteSupplier,
      addSale, addPurchase,
    }}>
      {children}
    </DataContext.Provider>
  );
}
