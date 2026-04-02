import { useState } from "react";
import { useData } from "@/context/DataContext";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Building, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Suppliers() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier } = useData();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", location: "", notes: "" });

  const resetForm = () => setForm({ name: "", phone: "", location: "", notes: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await addSupplier(form);
    resetForm();
    setOpen(false);
    toast.success("Supplier added!");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSupplier) return;
    await updateSupplier({ id: editSupplier.id, ...form });
    toast.success("Supplier updated!");
    setEditSupplier(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteSupplier(id);
    toast.success("Supplier deleted!");
    setDeleteConfirm(null);
    setEditSupplier(null);
  };

  const openEdit = (s: any) => {
    setForm({ name: s.name, phone: s.phone || "", location: s.location || "", notes: s.notes || "" });
    setEditSupplier(s);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage your supplier contacts</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add Supplier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Supplier Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Supplier name" required /></div>
              <div><Label>Phone Number</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 0712345678" /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Industrial Area, Nairobi" /></div>
              <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>
              <Button type="submit" className="w-full">Add Supplier</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {suppliers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No suppliers yet. Add your first supplier.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => (
            <Card key={s.id} className={`${isAdmin ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
              onClick={() => isAdmin && openEdit(s)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.phone || "No phone"}{s.location ? ` · ${s.location}` : ""}{s.notes ? ` · ${s.notes}` : ""}
                  </p>
                </div>
                {isAdmin && <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Supplier Dialog */}
      <Dialog open={!!editSupplier} onOpenChange={o => { if (!o) { setEditSupplier(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Save Changes</Button>
              <Button type="button" variant="destructive" className="gap-1" onClick={() => setDeleteConfirm(editSupplier?.id)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Supplier?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteConfirm!)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
