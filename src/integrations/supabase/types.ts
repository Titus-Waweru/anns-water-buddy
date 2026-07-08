export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          acquired_date: string | null
          branch_id: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          acquired_date?: string | null
          branch_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          value?: number
        }
        Update: {
          acquired_date?: string | null
          branch_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_submissions: {
        Row: {
          branch_id: string | null
          cash_amount: number
          cashier_id: string
          created_at: string
          credit_amount: number
          id: string
          mpesa_amount: number
          notes: string | null
          shift_date: string
          status: string
          total_amount: number
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          branch_id?: string | null
          cash_amount?: number
          cashier_id: string
          created_at?: string
          credit_amount?: number
          id?: string
          mpesa_amount?: number
          notes?: string | null
          shift_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          branch_id?: string | null
          cash_amount?: number
          cashier_id?: string
          created_at?: string
          credit_amount?: number
          id?: string
          mpesa_amount?: number
          notes?: string | null
          shift_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_submissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          branch_id: string | null
          created_at: string
          credit_balance: number
          customer_type: string
          email: string | null
          id: string
          loyalty_points: number
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          credit_balance?: number
          customer_type?: string
          email?: string | null
          id?: string
          loyalty_points?: number
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          created_at?: string
          credit_balance?: number
          customer_type?: string
          email?: string | null
          id?: string
          loyalty_points?: number
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          branch_id: string | null
          created_at: string
          date: string
          id: string
          product_id: string
          product_name: string
          quantity: number
          reference: string | null
          type: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          date?: string
          id?: string
          product_id: string
          product_name: string
          quantity: number
          reference?: string | null
          type: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          date?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          reference?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points: {
        Row: {
          created_at: string
          customer_id: string
          description: string | null
          id: string
          points: number
          sale_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          description?: string | null
          id?: string
          points: number
          sale_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          points?: number
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_deletions_audit: {
        Row: {
          amount: number | null
          correlation_id: string | null
          deleted_at: string
          deleted_by: string | null
          id: string
          message_reference: string | null
          payment_id: string
          sale_id: string | null
          snapshot: Json | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          correlation_id?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          message_reference?: string | null
          payment_id: string
          sale_id?: string | null
          snapshot?: Json | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          correlation_id?: string | null
          deleted_at?: string
          deleted_by?: string | null
          id?: string
          message_reference?: string | null
          payment_id?: string
          sale_id?: string | null
          snapshot?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
          correlation_id: string | null
          created_at: string
          entered_by: string | null
          id: string
          initiated_by: string | null
          message_reference: string
          mpesa_receipt: string | null
          narration: string | null
          notes: string | null
          operator_code: string | null
          payment_method: string | null
          payment_source: string | null
          payment_time: string | null
          phone_number: string
          provider: string
          raw_payload: Json | null
          raw_request: Json | null
          result_code: string | null
          result_description: string | null
          sale_id: string | null
          status: string
          transaction_currency: string
          transaction_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entered_by?: string | null
          id?: string
          initiated_by?: string | null
          message_reference: string
          mpesa_receipt?: string | null
          narration?: string | null
          notes?: string | null
          operator_code?: string | null
          payment_method?: string | null
          payment_source?: string | null
          payment_time?: string | null
          phone_number: string
          provider?: string
          raw_payload?: Json | null
          raw_request?: Json | null
          result_code?: string | null
          result_description?: string | null
          sale_id?: string | null
          status?: string
          transaction_currency?: string
          transaction_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entered_by?: string | null
          id?: string
          initiated_by?: string | null
          message_reference?: string
          mpesa_receipt?: string | null
          narration?: string | null
          notes?: string | null
          operator_code?: string | null
          payment_method?: string | null
          payment_source?: string | null
          payment_time?: string | null
          phone_number?: string
          provider?: string
          raw_payload?: Json | null
          raw_request?: Json | null
          result_code?: string | null
          result_description?: string | null
          sale_id?: string | null
          status?: string
          transaction_currency?: string
          transaction_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      production_records: {
        Row: {
          bales: number
          branch_id: string | null
          created_at: string
          economy_allocation: number
          economy_bottles: number
          economy_packs: number
          executive_bottles: number
          executive_packs: number
          expected_revenue: number
          faulty_bottles: number
          good_bottles: number
          id: string
          loose_bottles: number
          notes: string | null
          production_date: string
          recorded_by: string
          total_bottles: number
        }
        Insert: {
          bales?: number
          branch_id?: string | null
          created_at?: string
          economy_allocation?: number
          economy_bottles?: number
          economy_packs?: number
          executive_bottles?: number
          executive_packs?: number
          expected_revenue?: number
          faulty_bottles?: number
          good_bottles?: number
          id?: string
          loose_bottles?: number
          notes?: string | null
          production_date?: string
          recorded_by: string
          total_bottles?: number
        }
        Update: {
          bales?: number
          branch_id?: string | null
          created_at?: string
          economy_allocation?: number
          economy_bottles?: number
          economy_packs?: number
          executive_bottles?: number
          executive_packs?: number
          expected_revenue?: number
          faulty_bottles?: number
          good_bottles?: number
          id?: string
          loose_bottles?: number
          notes?: string | null
          production_date?: string
          recorded_by?: string
          total_bottles?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          bales: number
          bottle_size: string
          bottles_per_bale: number
          bottles_per_pack: number
          branch_id: string | null
          buying_price: number
          created_at: string
          faulty_bottles: number
          id: string
          low_stock_threshold: number
          name: string
          packs: number
          quantity: number
          selling_price: number
          updated_at: string
        }
        Insert: {
          bales?: number
          bottle_size: string
          bottles_per_bale?: number
          bottles_per_pack?: number
          branch_id?: string | null
          buying_price?: number
          created_at?: string
          faulty_bottles?: number
          id?: string
          low_stock_threshold?: number
          name: string
          packs?: number
          quantity?: number
          selling_price?: number
          updated_at?: string
        }
        Update: {
          bales?: number
          bottle_size?: string
          bottles_per_bale?: number
          bottles_per_pack?: number
          branch_id?: string | null
          buying_price?: number
          created_at?: string
          faulty_bottles?: number
          id?: string
          low_stock_threshold?: number
          name?: string
          packs?: number
          quantity?: number
          selling_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          branch_id: string | null
          buying_price: number
          created_at: string
          date: string
          id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          product_id: string
          product_name: string
          quantity: number
          recorded_by: string | null
          supplier_id: string | null
          supplier_name: string
          total_cost: number
        }
        Insert: {
          branch_id?: string | null
          buying_price: number
          created_at?: string
          date?: string
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          product_id: string
          product_name: string
          quantity: number
          recorded_by?: string | null
          supplier_id?: string | null
          supplier_name: string
          total_cost: number
        }
        Update: {
          branch_id?: string | null
          buying_price?: number
          created_at?: string
          date?: string
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          product_id?: string
          product_name?: string
          quantity?: number
          recorded_by?: string | null
          supplier_id?: string | null
          supplier_name?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string | null
          buying_price: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          date: string
          discount_amount: number
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number
          final_amount: number
          id: string
          idempotency_key: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          payment_status: string
          product_id: string
          product_name: string
          profit: number
          quantity: number
          recorded_by: string | null
          selling_price: number
          total_amount: number
        }
        Insert: {
          branch_id?: string | null
          buying_price: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          date?: string
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number
          final_amount: number
          id?: string
          idempotency_key?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_status?: string
          product_id: string
          product_name: string
          profit: number
          quantity: number
          recorded_by?: string | null
          selling_price: number
          total_amount: number
        }
        Update: {
          branch_id?: string | null
          buying_price?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          date?: string
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number
          final_amount?: number
          id?: string
          idempotency_key?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          payment_status?: string
          product_id?: string
          product_name?: string
          profit?: number
          quantity?: number
          recorded_by?: string | null
          selling_price?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_type: Database["public"]["Enums"]["adjustment_type"]
          approved_by: string | null
          branch_id: string | null
          created_at: string
          id: string
          product_id: string
          product_name: string
          quantity: number
          reason: string | null
          requested_by: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          adjustment_type: Database["public"]["Enums"]["adjustment_type"]
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          product_id: string
          product_name: string
          quantity: number
          reason?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          adjustment_type?: Database["public"]["Enums"]["adjustment_type"]
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          reason?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_records: {
        Row: {
          amount: number
          billing_cycle: string
          created_at: string
          grace_period_days: number
          id: string
          last_payment_date: string | null
          next_due_date: string
          payment_reference: string | null
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          grace_period_days?: number
          id?: string
          last_payment_date?: string | null
          next_due_date: string
          payment_reference?: string | null
          purpose?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          grace_period_days?: number
          id?: string
          last_payment_date?: string | null
          next_due_date?: string
          payment_reference?: string | null
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          is_encrypted: boolean
          setting_key: string
          setting_value: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_encrypted?: boolean
          setting_key: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_encrypted?: boolean
          setting_key?: string
          setting_value?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      targets: {
        Row: {
          actual_profit: number
          branch_id: string | null
          consequence: string | null
          created_at: string
          created_by: string
          current_value: number
          expected_profit: number
          id: string
          period: string
          period_end: string
          period_start: string
          reward: string | null
          target_type: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_profit?: number
          branch_id?: string | null
          consequence?: string | null
          created_at?: string
          created_by: string
          current_value?: number
          expected_profit?: number
          id?: string
          period?: string
          period_end: string
          period_start: string
          reward?: string | null
          target_type: string
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_profit?: number
          branch_id?: string | null
          consequence?: string | null
          created_at?: string
          created_by?: string
          current_value?: number
          expected_profit?: number
          id?: string
          period?: string
          period_end?: string
          period_start?: string
          reward?: string | null
          target_type?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_assignments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          date: string
          id: string
          notes: string | null
          purpose: string
          recorded_by: string | null
          voucher_number: string
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          purpose: string
          recorded_by?: string | null
          voucher_number: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          purpose?: string
          recorded_by?: string | null
          voucher_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      adjustment_type: "increase" | "decrease"
      app_role: "superadmin" | "supervisor" | "cashier" | "stock_manager"
      approval_status: "pending" | "approved" | "rejected"
      discount_type: "percentage" | "fixed"
      payment_mode: "Cash" | "Mpesa" | "Credit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      adjustment_type: ["increase", "decrease"],
      app_role: ["superadmin", "supervisor", "cashier", "stock_manager"],
      approval_status: ["pending", "approved", "rejected"],
      discount_type: ["percentage", "fixed"],
      payment_mode: ["Cash", "Mpesa", "Credit"],
    },
  },
} as const
