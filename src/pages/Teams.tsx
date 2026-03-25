import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole, type ApprovalStatus } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Loader2, UserCheck, UserX, Search, Users } from "lucide-react";
import { toast } from "sonner";

interface UserRecord {
  user_id: string;
  full_name: string;
  phone: string | null;
  status: ApprovalStatus;
  email?: string;
  roles: AppRole[];
  branch_id: string | null;
  branch_name: string | null;
}

interface Branch {
  id: string;
  name: string;
}

export default function Teams() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const [profilesRes, rolesRes, assignmentsRes, branchesRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("user_branch_assignments").select("*, branches(name)"),
      supabase.from("branches").select("id, name"),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];
    const assignments = assignmentsRes.data || [];
    setBranches(branchesRes.data || []);

    const userRecords: UserRecord[] = profiles.map((p) => {
      const userRoles = roles.filter((r) => r.user_id === p.user_id).map((r) => r.role as AppRole);
      const assignment = assignments.find((a) => a.user_id === p.user_id);
      return {
        user_id: p.user_id,
        full_name: p.full_name,
        phone: p.phone,
        status: p.status as ApprovalStatus,
        roles: userRoles,
        branch_id: assignment?.branch_id || null,
        branch_name: (assignment as any)?.branches?.name || null,
      };
    });

    setUsers(userRecords);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const updateStatus = async (userId: string, status: ApprovalStatus) => {
    setActionLoading(userId);
    const { error } = await supabase.from("profiles").update({ status }).eq("user_id", userId);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`User ${status === "approved" ? "approved" : "rejected"}`);
      fetchUsers();
    }
    setActionLoading(null);
  };

  const assignRole = async (userId: string, role: AppRole) => {
    setActionLoading(userId);
    // Remove existing roles first, then assign new one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) {
      toast.error("Failed to assign role");
    } else {
      toast.success(`Role "${role}" assigned`);
      fetchUsers();
    }
    setActionLoading(null);
  };

  const assignBranch = async (userId: string, branchId: string) => {
    setActionLoading(userId);
    // Remove existing assignment, then assign new one
    await supabase.from("user_branch_assignments").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_branch_assignments").insert({ user_id: userId, branch_id: branchId });
    if (error) {
      toast.error("Failed to assign branch");
    } else {
      toast.success("Branch assigned");
      fetchUsers();
    }
    setActionLoading(null);
  };

  const filteredUsers = users.filter((u) => {
    if (filter !== "all" && u.status !== filter) return false;
    if (search && !u.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const statusBadge = (status: ApprovalStatus) => {
    const variants: Record<ApprovalStatus, string> = {
      pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
      approved: "bg-green-100 text-green-800 border-green-300",
      rejected: "bg-red-100 text-red-800 border-red-300",
    };
    return <Badge className={`${variants[status]} border`}>{status}</Badge>;
  };

  if (!isAdmin) {
    return <div className="p-6 text-center text-muted-foreground">You don't have permission to access this page.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Management</h1>
          <p className="text-sm text-muted-foreground">Manage users, roles, and branch assignments</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", count: users.length },
          { label: "Pending", count: users.filter((u) => u.status === "pending").length },
          { label: "Approved", count: users.filter((u) => u.status === "approved").length },
          { label: "Rejected", count: users.filter((u) => u.status === "rejected").length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold text-foreground">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Users ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No users found</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell>{u.phone || "—"}</TableCell>
                      <TableCell>{statusBadge(u.status)}</TableCell>
                      <TableCell>
                        <Select
                          value={u.roles[0] || "none"}
                          onValueChange={(v) => { if (v !== "none") assignRole(u.user_id, v as AppRole); }}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Assign role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>No role</SelectItem>
                            <SelectItem value="superadmin">Superadmin</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="cashier">Cashier</SelectItem>
                            <SelectItem value="stock_manager">Stock Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.branch_id || "none"}
                          onValueChange={(v) => { if (v !== "none") assignBranch(u.user_id, v); }}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Assign branch" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>No branch</SelectItem>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {u.status !== "approved" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={actionLoading === u.user_id} onClick={() => updateStatus(u.user_id, "approved")}>
                              {actionLoading === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                              Approve
                            </Button>
                          )}
                          {u.status !== "rejected" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive" disabled={actionLoading === u.user_id} onClick={() => updateStatus(u.user_id, "rejected")}>
                              {actionLoading === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                              Reject
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
