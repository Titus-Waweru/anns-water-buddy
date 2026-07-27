import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Megaphone, Plus, Loader2, Trash2, Pencil, AlertTriangle, Info, Bell, Calendar, User, Building, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: "Normal" | "Important" | "Critical";
  target_type: "All Users" | "Branch";
  target_branch_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  is_active: boolean;
  is_pinned: boolean;
}

interface Branch {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const priorityConfig = {
  Normal: { color: "bg-secondary text-secondary-foreground", icon: Info },
  Important: { color: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", icon: Bell },
  Critical: { color: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle },
};

export default function Announcements() {
  const { isAdmin, hasRole, user } = useAuth();
  const canManage = isAdmin || hasRole("supervisor");
  const canEdit = isAdmin || hasRole("supervisor");
  const canDelete = isAdmin || hasRole("supervisor");

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Form state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    message: "",
    priority: "Normal" as "Normal" | "Important" | "Critical",
    target_type: "All Users" as "All Users" | "Branch",
    target_branch_id: "",
    expires_at: "",
  });
  const [saving, setSaving] = useState(false);

  const selected = announcements.find(a => a.id === selectedId);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [annRes, branchRes, profileRes] = await Promise.all([
      (supabase as any).rpc("get_active_announcements"),
      (supabase as any).from("branches").select("id, name").eq("is_active", true).order("name"),
      (supabase as any).from("profiles").select("id, full_name"),
    ]);
    if (annRes.data) setAnnouncements(annRes.data as Announcement[]);
    if (branchRes.data) setBranches(branchRes.data as Branch[]);
    if (profileRes.data) setProfiles(profileRes.data as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getSenderName = (userId: string) => {
    const p = profiles.find(pr => pr.id === userId);
    return p?.full_name || "Unknown";
  };

  const openNewDialog = () => {
    setEditingId(null);
    setForm({ title: "", message: "", priority: "Normal", target_type: "All Users", target_branch_id: "", expires_at: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (a: Announcement) => {
    setEditingId(a.id);
    setForm({
      title: a.title,
      message: a.message,
      priority: a.priority,
      target_type: a.target_type,
      target_branch_id: a.target_branch_id || "",
      expires_at: a.expires_at ? format(new Date(a.expires_at), "yyyy-MM-dd'T'HH:mm") : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.message.trim()) { toast.error("Message is required"); return; }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        message: form.message.trim(),
        priority: form.priority,
        target_type: form.target_type,
        target_branch_id: form.target_type === "Branch" && form.target_branch_id ? form.target_branch_id : null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };

      if (editingId) {
        const { error } = await (supabase as any).from("announcements").update(payload).eq("id", editingId);
        if (error) throw new Error(error.message);
        toast.success("Announcement updated");
      } else {
        payload.created_by = user!.id;
        const { error } = await (supabase as any).from("announcements").insert(payload);
        if (error) throw new Error(error.message);
        toast.success("Announcement published");
      }

      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save announcement");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      const { error } = await (supabase as any).from("announcements").delete().eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Announcement deleted");
      if (selectedId === id) setSelectedId(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete announcement");
    }
  };

  const handleToggleActive = async (a: Announcement) => {
    try {
      const { error } = await (supabase as any).from("announcements").update({ is_active: !a.is_active }).eq("id", a.id);
      if (error) throw new Error(error.message);
      toast.success(a.is_active ? "Announcement deactivated" : "Announcement activated");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update announcement");
    }
  };

  const handleTogglePin = async (a: Announcement) => {
    try {
      const { error } = await (supabase as any).from("announcements").update({ is_pinned: !a.is_pinned }).eq("id", a.id);
      if (error) throw new Error(error.message);
      toast.success(a.is_pinned ? "Announcement unpinned" : "Announcement pinned");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update announcement");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
            <p className="text-sm text-muted-foreground">Internal company communication board</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={openNewDialog} className="gap-2">
            <Plus className="h-4 w-4" /> New Announcement
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No announcements yet.</p>
            {canManage && (
              <Button onClick={openNewDialog} variant="outline" className="mt-3 gap-2">
                <Plus className="h-4 w-4" /> Create the first announcement
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Announcement List */}
          <Card>
            <CardHeader><CardTitle className="text-base">All Announcements</CardTitle></CardHeader>
            <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
              {announcements.map(a => {
                const PriorityIcon = priorityConfig[a.priority].icon;
                return (
                  <Card
                    key={a.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${selectedId === a.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`text-[10px] gap-1 ${priorityConfig[a.priority].color}`}>
                            <PriorityIcon className="h-3 w-3" />
                            {a.priority}
                          </Badge>
                          {a.is_pinned && (
                            <span className="text-[10px]" title="Pinned">📌</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(a.created_at), "dd MMM yyyy")}
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.message}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{getSenderName(a.created_by)}</span>
                        {a.target_type === "Branch" && (
                          <>
                            <Building className="h-3 w-3 ml-1" />
                            <span>{branches.find(b => b.id === a.target_branch_id)?.name || "Branch"}</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>

          {/* Right Panel - Selected Announcement */}
          <Card>
            <CardHeader><CardTitle className="text-base">Announcement Details</CardTitle></CardHeader>
            <CardContent>
              {!selected ? (
                <p className="text-sm text-muted-foreground text-center py-12">Select an announcement to view details</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge className={`text-xs gap-1 ${priorityConfig[selected.priority].color}`}>
                      {(() => { const Icon = priorityConfig[selected.priority].icon; return <Icon className="h-3 w-3" />; })()}
                      {selected.priority}
                    </Badge>
                    <div className="flex gap-2">
                      {isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => handleTogglePin(selected)} title={selected.is_pinned ? "Unpin" : "Pin"}>
                          {selected.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </Button>
                      )}
                      {canEdit && (isAdmin || selected.created_by === user?.id) && (
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(selected)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      {canDelete && (isAdmin || selected.created_by === user?.id) && (
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(selected.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-foreground">{selected.title}</h2>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm whitespace-pre-wrap text-foreground">{selected.message}</p>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground border-t pt-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>Created by: <strong>{getSenderName(selected.created_by)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Posted: {format(new Date(selected.created_at), "dd MMM yyyy HH:mm")}</span>
                    </div>
                    {selected.expires_at && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Expires: {format(new Date(selected.expires_at), "dd MMM yyyy HH:mm")}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      <span>Target: {selected.target_type}{selected.target_branch_id ? ` — ${branches.find(b => b.id === selected.target_branch_id)?.name || "Unknown"}` : ""}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Stock Taking Reminder"
              />
            </div>
            <div>
              <Label>Message *</Label>
              <Textarea
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder="Write your announcement message..."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Important">Important</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target</Label>
                <Select value={form.target_type} onValueChange={v => setForm({ ...form, target_type: v as any, target_branch_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Users">All Users</SelectItem>
                    <SelectItem value="Branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.target_type === "Branch" && (
              <div>
                <Label>Target Branch *</Label>
                <Select value={form.target_branch_id} onValueChange={v => setForm({ ...form, target_branch_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Expiry Date (optional)</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {editingId ? "Update Announcement" : "Publish Announcement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
