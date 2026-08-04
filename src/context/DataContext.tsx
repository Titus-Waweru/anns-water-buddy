import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Database } from "@/integrations/supabase/types";
import { queueOfflineAction } from "@/lib/offlineDb";
import { toast } from "sonner";

type DbProduct = Database["public"]["Tables"]["products"]["Row"];
type DbCustomer = Database["public"]["Tables"]["customers"]["Row"];
type DbSupplier = Database["public"]["Tables"]["suppliers"]["Row"];
type DbSale = Database["public"]["Tables"]["sales"]["Row"];
type DbSaleItem = Database["public"]["Tables"]["sale_items"]["Row"];
type DbSaleItemInsert = Database["public"]["Tables"]["sale_items"]["Insert"];
type DbPurchase = Database["public"]["Tables"]["purchases"]["Row"];
type DbInventoryLog = Database["public"]["Tables"]["inventory_logs"]["Row"];

export interface Branch {
  id: string;
  name: string;
  is_active: boolean;
}

interface DataContextType {
  products: DbProduct[];
  customers: DbCustomer[];
  suppliers: DbSupplier[];
  sales: DbSale[];
  purchases: DbPurchase[];
  inventoryLogs: DbInventoryLog[];
  loading: boolean;
  error: string | null;

  // Branch selector for admins
  branches: Branch[];
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
  effectiveBranchId: string | null; // The branch used for filtering & tagging

  addProduct: (p: Database["public"]["Tables"]["products"]["Insert"]) => Promise<void>;
  updateProduct: (p: Database["public"]["Tables"]["products"]["Update"] & { id: string }) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  addCustomer: (c: Database["public"]["Tables"]["customers"]["Insert"]) => Promise<void>;
  updateCustomer: (c: Database["public"]["Tables"]["customers"]["Update"] & { id: string }) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  addSupplier: (s: Database["public"]["Tables"]["suppliers"]["Insert"]) => Promise<void>;
  updateSupplier: (s: Database["public"]["Tables"]["suppliers"]["Update"] & { id: string }) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;

  addSale: (s: Database["public"]["Tables"]["sales"]["Insert"]) => Promise<void>;
  addCartSale: (s: Database["public"]["Tables"]["sales"]["Insert"] & { items: DbSaleItemInsert[] }) => Promise<void>;
  finalizeSale: (saleId: string) => Promise<void>;
  addPurchase: (p: Database["public"]["Tables"]["purchases"]["Insert"]) => Promise<void>;

  refetch: () => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

const FETCH_TIMEOUT_MS = 7000;
const MAX_RETRIES = 2;

async function fetchWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), timeoutMs)
    ),
  ]);
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isSuperAdmin, branchId } = useAuth();
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [sales, setSales] = useState<DbSale[]>([]);
  const [purchases, setPurchases] = useState<DbPurchase[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<DbInventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  // Branch management
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Effective branch: for non-admins it's their assigned branch; for admins it's selected or null (all)
  const effectiveBranchId = isAdmin ? selectedBranchId : branchId;

  // Fetch branches for admins
  useEffect(() => {
    if (!user) return;
    supabase.from("branches").select("id, name, is_active").order("name").then(({ data }) => {
      if (data) setBranches(data);
    });
  }, [user]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    // For non-admin users, always filter by their branch
    // For admins, filter by selected branch (or show all if null)
    const filterBranch = isAdmin ? selectedBranchId : branchId;

    try {
      const result = await fetchWithTimeout(async () => {
        let prodQ = supabase.from("products").select("*").order("name");
        let custQ = supabase.from("customers").select("*").order("name");
        let suppQ = supabase.from("suppliers").select("*").order("name");
        let saleQ = supabase.from("sales").select("*").order("date", { ascending: false });
        let purchQ = supabase.from("purchases").select("*").order("date", { ascending: false });
        let logQ = supabase.from("inventory_logs").select("*").order("date", { ascending: false });

        if (filterBranch) {
          prodQ = prodQ.eq("branch_id", filterBranch);
          custQ = custQ.eq("branch_id", filterBranch);
          saleQ = saleQ.eq("branch_id", filterBranch);
          purchQ = purchQ.eq("branch_id", filterBranch);
          logQ = logQ.eq("branch_id", filterBranch);
        } else if (!isAdmin && !isSuperAdmin && branchId) {
          // Fallback safety for non-admin without filter
          prodQ = prodQ.eq("branch_id", branchId);
          custQ = custQ.eq("branch_id", branchId);
          saleQ = saleQ.eq("branch_id", branchId);
          purchQ = purchQ.eq("branch_id", branchId);
          logQ = logQ.eq("branch_id", branchId);
        }

        return Promise.all([prodQ, custQ, suppQ, saleQ, purchQ, logQ]);
      });

      const [prodRes, custRes, suppRes, saleRes, purchRes, logRes] = result;
      if (prodRes.data) setProducts(prodRes.data);
      if (custRes.data) setCustomers(custRes.data);
      if (suppRes.data) setSuppliers(suppRes.data);
      if (saleRes.data) setSales(saleRes.data);
      if (purchRes.data) setPurchases(purchRes.data);
      if (logRes.data) setInventoryLogs(logRes.data);
      retryCount.current = 0;
    } catch (err) {
      console.error("DataContext fetch error:", err);
      if (retryCount.current < MAX_RETRIES) {
        retryCount.current++;
        setTimeout(() => fetchAll(), 1000);
        return;
      }
      setError("Failed to load data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [user, isSuperAdmin, isAdmin, branchId, selectedBranchId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addProduct = useCallback(async (p: Database["public"]["Tables"]["products"]["Insert"]) => {
    const { error } = await supabase.from("products").insert({ ...p, branch_id: p.branch_id || effectiveBranchId });
    if (error) {
      if ((error as any).code === "23505") {
        toast.error(`A product named "${p.name}" already exists in this branch.`);
      } else {
        toast.error(error.message);
      }
      throw error;
    }
    fetchAll();
  }, [fetchAll, effectiveBranchId]);

  const updateProduct = useCallback(async (p: Database["public"]["Tables"]["products"]["Update"] & { id: string }) => {
    const { id, ...rest } = p;
    await supabase.from("products").update(rest).eq("id", id);
    fetchAll();
  }, [fetchAll]);

  const deleteProduct = useCallback(async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    fetchAll();
  }, [fetchAll]);

  const addCustomer = useCallback(async (c: Database["public"]["Tables"]["customers"]["Insert"]) => {
    const customerWithBranch = { ...c, branch_id: c.branch_id || effectiveBranchId };
    if (!navigator.onLine) {
      await queueOfflineAction("customers", customerWithBranch as Record<string, unknown>);
      toast.info("Customer saved offline — will sync when back online");
      return;
    }
    await supabase.from("customers").insert(customerWithBranch);
    fetchAll();
  }, [fetchAll, effectiveBranchId]);

  const updateCustomer = useCallback(async (c: Database["public"]["Tables"]["customers"]["Update"] & { id: string }) => {
    const { id, ...rest } = c;
    await supabase.from("customers").update(rest).eq("id", id);
    fetchAll();
  }, [fetchAll]);

  const deleteCustomer = useCallback(async (id: string) => {
    await supabase.from("customers").delete().eq("id", id);
    fetchAll();
  }, [fetchAll]);

  const addSupplier = useCallback(async (s: Database["public"]["Tables"]["suppliers"]["Insert"]) => {
    await supabase.from("suppliers").insert(s);
    fetchAll();
  }, [fetchAll]);

  const updateSupplier = useCallback(async (s: Database["public"]["Tables"]["suppliers"]["Update"] & { id: string }) => {
    const { id, ...rest } = s;
    await supabase.from("suppliers").update(rest).eq("id", id);
    fetchAll();
  }, [fetchAll]);

  const deleteSupplier = useCallback(async (id: string) => {
    await supabase.from("suppliers").delete().eq("id", id);
    fetchAll();
  }, [fetchAll]);

  const addSale = useCallback(async (s: Database["public"]["Tables"]["sales"]["Insert"]) => {
    const saleWithBranch = { ...s, branch_id: s.branch_id || effectiveBranchId, recorded_by: s.recorded_by || user?.id };

    if (!navigator.onLine) {
      await queueOfflineAction("sales", saleWithBranch as Record<string, unknown>);
      toast.info("Sale saved offline — will sync when back online");
      return;
    }

    const { data: saleData, error: saleErr } = await supabase.from("sales").insert(saleWithBranch).select().single();
    if (saleErr || !saleData) return;

    // Reduce inventory
    const product = products.find(p => p.id === s.product_id);
    if (product) {
      await supabase.from("products").update({ quantity: Math.max(0, product.quantity - s.quantity) }).eq("id", s.product_id);
    }

    // Log
    await supabase.from("inventory_logs").insert({
      product_id: s.product_id,
      product_name: s.product_name,
      type: "OUT",
      quantity: s.quantity,
      reference: `Sale to ${s.customer_name || "Walk-in"}`,
      date: s.date || new Date().toISOString(),
      branch_id: s.branch_id || effectiveBranchId,
    });

    // Update customer credit if credit sale
    if (s.payment_mode === "Credit" && s.customer_id) {
      const cust = customers.find(c => c.id === s.customer_id);
      if (cust) {
        await supabase.from("customers").update({
          credit_balance: cust.credit_balance + s.final_amount,
        }).eq("id", s.customer_id);
      }
    }

    fetchAll();
  }, [fetchAll, products, customers, effectiveBranchId, user]);

  const finalizeSale = useCallback(async (saleId: string) => {
    // Single atomic, idempotent settlement: stock deduction, inventory logs,
    // credit balance and loyalty points all happen inside one DB transaction.
    const { error } = await (supabase as any).rpc("finalize_sale_payment", { p_sale_id: saleId });
    if (error) {
      console.error("finalize_sale_payment failed", error);
      toast.error(error.message || "Could not finalize the sale. It stays pending — please retry.");
      throw error;
    }
    fetchAll();
  }, [fetchAll]);


  const addCartSale = useCallback(async (payload: Database["public"]["Tables"]["sales"]["Insert"] & { items: DbSaleItemInsert[] }) => {
    if (!navigator.onLine) {
      toast.error("Multi-item checkout requires an online connection. Please reconnect and try again.");
      throw new Error("Offline multi-item checkout unsupported");
    }

    // Ensure Mpesa-initiated cart sales are created PENDING unless caller explicitly set otherwise.
    // This guards against the DB default of 'PAID' (for backward compat) accidentally finalizing
    // a sale before an STK push is sent.
    const { items, ...saleHeader } = payload as any;
    if (saleHeader?.payment_mode === "Mpesa" && typeof saleHeader.payment_status === "undefined") {
      saleHeader.payment_status = "PENDING";
    }
    const saleWithBranch = { ...saleHeader, branch_id: saleHeader.branch_id || effectiveBranchId, recorded_by: saleHeader.recorded_by || user?.id };
    const { data: saleData, error: saleErr } = await supabase.from("sales").insert(saleWithBranch).select().single();
    if (saleErr || !saleData) {
      // Handle idempotency conflict: if a previous attempt already created the sale
      // with the same `idempotency_key`, return that existing sale instead of throwing.
      if ((saleErr as any)?.code === "23505" && saleWithBranch.idempotency_key) {
        const { data: existing } = await supabase.from("sales").select().eq("idempotency_key", saleWithBranch.idempotency_key).maybeSingle();
        if (existing) {
          fetchAll();
          return existing as any;
        }
      }
      throw saleErr || new Error("Failed to create sale");
    }

    const itemsToInsert = items.map(item => ({
      ...item,
      sale_id: saleData.id,
      branch_id: saleData.branch_id,
    }));
    const { error: itemsErr } = await supabase.from("sale_items").insert(itemsToInsert);
    if (itemsErr) throw itemsErr;

    if (saleData.payment_status !== "PENDING") {
      if (saleData.payment_mode === "Mpesa") {
        console.warn("Cart sale created with non-pending payment_status for Mpesa:", saleData.id, saleData.payment_status);
      }
      for (const item of items) {
        const product = products.find(p => p.id === item.product_id);
        if (product) {
          await supabase.from("products").update({ quantity: Math.max(0, product.quantity - item.quantity) }).eq("id", item.product_id);
        }
        await supabase.from("inventory_logs").insert({
          product_id: item.product_id,
          product_name: item.product_name,
          type: "OUT",
          quantity: item.quantity,
          reference: `Sale to ${saleWithBranch.customer_name || "Walk-in"}`,
          date: saleWithBranch.date || new Date().toISOString(),
          branch_id: saleData.branch_id || effectiveBranchId,
        });
      }

      if (saleData.payment_mode === "Credit" && saleData.customer_id) {
        const cust = customers.find(c => c.id === saleData.customer_id);
        if (cust) {
          await supabase.from("customers").update({
            credit_balance: cust.credit_balance + saleData.final_amount,
          }).eq("id", saleData.customer_id);
        }
      }
    }

    fetchAll();
    return saleData;
  }, [fetchAll, products, customers, effectiveBranchId, user]);

  const addPurchase = useCallback(async (p: Database["public"]["Tables"]["purchases"]["Insert"]) => {
    const purchaseWithBranch = { ...p, branch_id: p.branch_id || effectiveBranchId, recorded_by: p.recorded_by || user?.id };
    const { error } = await supabase.from("purchases").insert(purchaseWithBranch);
    if (error) return;

    // Increase inventory
    const product = products.find(prod => prod.id === p.product_id);
    if (product) {
      await supabase.from("products").update({
        quantity: product.quantity + p.quantity,
        buying_price: p.buying_price,
      }).eq("id", p.product_id);
    }

    // Log
    await supabase.from("inventory_logs").insert({
      product_id: p.product_id,
      product_name: p.product_name,
      type: "IN",
      quantity: p.quantity,
      reference: `Purchase from ${p.supplier_name}`,
      date: p.date || new Date().toISOString(),
      branch_id: p.branch_id || effectiveBranchId,
    });

    fetchAll();
  }, [fetchAll, products, effectiveBranchId, user]);

  return (
    <DataContext.Provider value={{
      products, customers, suppliers, sales, purchases, inventoryLogs, loading, error,
      branches, selectedBranchId, setSelectedBranchId, effectiveBranchId,
      addProduct, updateProduct, deleteProduct,
      addCustomer, updateCustomer, deleteCustomer,
      addSupplier, updateSupplier, deleteSupplier,
      addSale, addPurchase, refetch: fetchAll,
      addCartSale, finalizeSale,
    }}>
      {children}
    </DataContext.Provider>
  );
}