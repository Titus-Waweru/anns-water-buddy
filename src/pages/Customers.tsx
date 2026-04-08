import { useState, useMemo, useRef, useCallback } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Search, FileText, Phone, Mail, MapPin, Star, Pencil, Trash2, Download, Printer } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import InvoicePDF from "@/components/InvoicePDF";
import AnimatedPage from "@/components/AnimatedPage";

export default function Customers() {
  const { customers, sales, addCustomer, updateCustomer, deleteCustomer } = useData();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", notes: "",
    customer_type: "regular" as string, credit_balance: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone && c.phone.includes(search)) ||
        ((c as any).email && (c as any).email.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === "all" ||
        (filterType === "debt" && c.credit_balance > 0) ||
        (filterType === "loyalty" && (c as any).customer_type === "loyalty") ||
        (filterType === "regular" && ((c as any).customer_type === "regular" || !(c as any).customer_type));
      return matchesSearch && matchesType;
    });
  }, [customers, search, filterType]);

  const totalDebt = customers.reduce((s, c) => s + c.credit_balance, 0);
  const totalLoyaltyCustomers = customers.filter(c => (c as any).customer_type === "loyalty").length;

  const resetForm = () => setForm({ name: "", phone: "", email: "", address: "", notes: "", customer_type: "regular", credit_balance: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.phone) {
      const dup = customers.find(c => c.phone === form.phone);
      if (dup) { toast({ title: "Duplicate phone number", description: `${dup.name} already has this phone.`, variant: "destructive" }); return; }
    }
    if (form.email) {
      const dup = customers.find(c => (c as any).email === form.email);
      if (dup) { toast({ title: "Duplicate email", description: `${dup.name} already has this email.`, variant: "destructive" }); return; }
    }
    setSubmitting(true);
    try {
      await addCustomer(form as any);
      resetForm();
      setOpen(false);
      toast({ title: "Customer added successfully" });
    } catch { toast({ title: "Failed to add customer", variant: "destructive" }); }
    setSubmitting(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCustomer || !form.name.trim()) return;
    setSubmitting(true);
    try {
      await updateCustomer({ id: detailCustomer, ...form } as any);
      toast({ title: "Customer updated" });
      setEditMode(false);
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await deleteCustomer(id);
    toast({ title: "Customer deleted" });
    setDeleteConfirm(null);
    setDetailCustomer(null);
    setEditMode(false);
  };

  const openDetail = (c: any) => {
    setDetailCustomer(c.id);
    setEditMode(false);
    setForm({
      name: c.name, phone: c.phone || "", email: (c as any).email || "",
      address: (c as any).address || "", notes: c.notes || "",
      customer_type: (c as any).customer_type || "regular", credit_balance: c.credit_balance,
    });
  };

  const customerSales = useMemo(() => {
    if (!detailCustomer) return [];
    return sales.filter(s => s.customer_id === detailCustomer);
  }, [detailCustomer, sales]);

  const selectedCustomer = customers.find(c => c.id === detailCustomer);

  const invoiceRef = useRef<HTMLDivElement>(null);

  const handlePrintInvoice = useCallback(() => {
    if (!invoiceRef.current) return;
    const printContent = invoiceRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Invoice - ${selectedCustomer?.name || "Customer"}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 8px 12px; text-align: left; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      </style></head>
      <body>${printContent}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  }, [selectedCustomer]);

  return (
    <AnimatedPage>
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} customers · KSh {totalDebt.toLocaleString()} total debt</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Customer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer name" required /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0712345678" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="customer@email.com" /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Delivery address" /></div>
              <div>
                <Label>Customer Type</Label>
                <Select value={form.customer_type} onValueChange={v => setForm({ ...form, customer_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="loyalty">Loyalty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Adding..." : "Add Customer"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="stat-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Customers</p>
          <p className="text-xl font-bold text-foreground">{customers.length}</p>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Loyalty Members</p>
          <p className="text-xl font-bold text-secondary">{totalLoyaltyCustomers}</p>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Debt Owed</p>
          <p className="text-xl font-bold text-destructive">KSh {totalDebt.toLocaleString()}</p>
        </CardContent></Card>
        <Card className="stat-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">With Debt</p>
          <p className="text-xl font-bold text-warning">{customers.filter(c => c.credit_balance > 0).length}</p>
        </CardContent></Card>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, phone, or email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="regular">Regular</SelectItem>
            <SelectItem value="loyalty">Loyalty</SelectItem>
            <SelectItem value="debt">With Debt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredCustomers.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No customers found.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filteredCustomers.map(c => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(c)}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">{c.name}</p>
                    {(c as any).customer_type === "loyalty" && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-secondary text-secondary"><Star className="h-3 w-3" />Loyalty</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    {(c as any).email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{(c as any).email}</span>}
                    {(c as any).address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{(c as any).address}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.loyalty_points > 0 && <Badge variant="outline" className="text-[10px]">{c.loyalty_points} pts</Badge>}
                  {c.credit_balance > 0 && <Badge variant="destructive">KSh {c.credit_balance.toLocaleString()}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Customer detail dialog */}
      <Dialog open={!!detailCustomer} onOpenChange={o => { if (!o) { setDetailCustomer(null); setEditMode(false); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {editMode ? "Edit Customer" : selectedCustomer.name}
                  {!editMode && (selectedCustomer as any).customer_type === "loyalty" && <Badge variant="outline" className="border-secondary text-secondary">Loyalty</Badge>}
                  {!editMode && isAdmin && (
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditMode(true)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirm(selectedCustomer.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  )}
                </DialogTitle>
              </DialogHeader>

              {editMode ? (
                <form onSubmit={handleEditSubmit} className="space-y-3">
                  <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                  <div>
                    <Label>Type</Label>
                    <Select value={form.customer_type} onValueChange={v => setForm({ ...form, customer_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="loyalty">Loyalty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={submitting}>Save</Button>
                    <Button type="button" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <Tabs defaultValue="info">
                  <TabsList className="w-full">
                    <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
                    <TabsTrigger value="history" className="flex-1">Purchase History</TabsTrigger>
                    {selectedCustomer.credit_balance > 0 && <TabsTrigger value="invoice" className="flex-1">Invoice</TabsTrigger>}
                  </TabsList>
                  <TabsContent value="info" className="space-y-3 mt-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{selectedCustomer.phone || "N/A"}</p></div>
                      <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{(selectedCustomer as any).email || "N/A"}</p></div>
                      <div><span className="text-muted-foreground">Address:</span><p className="font-medium">{(selectedCustomer as any).address || "N/A"}</p></div>
                      <div><span className="text-muted-foreground">Type:</span><p className="font-medium capitalize">{(selectedCustomer as any).customer_type || "regular"}</p></div>
                      <div><span className="text-muted-foreground">Credit Balance:</span><p className="font-medium text-destructive">KSh {selectedCustomer.credit_balance.toLocaleString()}</p></div>
                      <div><span className="text-muted-foreground">Loyalty Points:</span><p className="font-medium">{selectedCustomer.loyalty_points}</p></div>
                    </div>
                    {selectedCustomer.notes && <p className="text-sm text-muted-foreground italic">{selectedCustomer.notes}</p>}
                  </TabsContent>
                  <TabsContent value="history" className="mt-3">
                    {customerSales.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No purchases yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {customerSales.map(s => (
                          <div key={s.id} className="flex items-center justify-between text-sm border-b pb-2">
                            <div>
                              <p className="font-medium">{s.product_name} × {s.quantity}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(s.date), "dd MMM yyyy, HH:mm")}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">KSh {s.final_amount.toLocaleString()}</p>
                              <Badge variant="outline" className="text-[10px]">{s.payment_mode}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  {selectedCustomer.credit_balance > 0 && (
                    <TabsContent value="invoice" className="mt-3 space-y-3">
                      <div className="border rounded-lg overflow-hidden">
                        <InvoicePDF
                          ref={invoiceRef}
                          customer={{
                            name: selectedCustomer.name,
                            phone: selectedCustomer.phone,
                            email: (selectedCustomer as any).email,
                            address: (selectedCustomer as any).address,
                            credit_balance: selectedCustomer.credit_balance,
                          }}
                          items={customerSales.filter(s => s.payment_mode === "Credit").map(s => ({
                            product_name: s.product_name,
                            quantity: s.quantity,
                            selling_price: s.selling_price,
                            final_amount: s.final_amount,
                            date: s.date,
                          }))}
                          invoiceNumber={`INV-${selectedCustomer.id.slice(0, 8).toUpperCase()}`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 gap-2" onClick={handlePrintInvoice}>
                          <Printer className="h-4 w-4" /> Print Invoice
                        </Button>
                        <Button variant="outline" className="flex-1 gap-2" onClick={handlePrintInvoice}>
                          <Download className="h-4 w-4" /> Download PDF
                        </Button>
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Customer?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently remove this customer record.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteConfirm!)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AnimatedPage>
  );
}
