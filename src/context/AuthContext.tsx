import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "superadmin" | "supervisor" | "cashier" | "stock_manager";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  status: ApprovalStatus;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  branchId: string | null;
  loading: boolean;
  isApproved: boolean;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

const AUTH_TIMEOUT_MS = 7000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const clearUserState = useCallback(() => {
    setProfile(null);
    setRoles([]);
    setBranchId(null);
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [profileRes, rolesRes, branchRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("user_branch_assignments").select("branch_id").eq("user_id", userId).limit(1).maybeSingle(),
      ]);
      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
      } else {
        // Profile not yet created (race condition) — clear and wait
        setProfile(null);
      }
      if (rolesRes.data) setRoles(rolesRes.data.map(r => r.role as AppRole));
      else setRoles([]);
      setBranchId(branchRes.data?.branch_id || null);
    } catch (err) {
      console.error("Failed to fetch user data:", err);
      clearUserState();
    } finally {
      fetchingRef.current = false;
    }
  }, [clearUserState]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      fetchingRef.current = false; // allow re-fetch
      await fetchUserData(user.id);
    }
  }, [user, fetchUserData]);

  useEffect(() => {
    let mounted = true;

    // Timeout fallback — never leave user stuck on loading
    timeoutRef.current = setTimeout(() => {
      if (mounted) setLoading(false);
    }, AUTH_TIMEOUT_MS);

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        await fetchUserData(s.user.id);
      } else {
        clearUserState();
      }
      clearTimeout(timeoutRef.current);
      if (mounted) setLoading(false);
    });

    // Single auth listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          // Fire and forget — never await inside onAuthStateChange
          fetchingRef.current = false;
          fetchUserData(s.user.id).then(() => {
            clearTimeout(timeoutRef.current);
            if (mounted) setLoading(false);
          });
        } else {
          clearUserState();
          clearTimeout(timeoutRef.current);
          if (mounted) setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutRef.current);
    };
  }, [fetchUserData, clearUserState]);

  const signUp = async (email: string, password: string, fullName: string, phone?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error?.message ?? null };
  };

  const signIn = async (email: string, password: string) => {
    // Clear stale state before new login
    clearUserState();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    // Clear state instantly, then call API
    setUser(null);
    setSession(null);
    clearUserState();
    await supabase.auth.signOut();
  };

  const isSuperAdmin = roles.includes("superadmin");
  const isApproved = profile?.status === "approved" || isSuperAdmin;
  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = roles.includes("superadmin") || roles.includes("supervisor");

  return (
    <AuthContext.Provider value={{
      user, session, profile, roles, branchId, loading,
      isApproved, hasRole, isAdmin, isSuperAdmin,
      signUp, signIn, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
