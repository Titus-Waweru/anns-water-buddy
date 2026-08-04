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
      announcements: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          priority: string
          target_branch_id: string | null
          target_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          priority?: string
          target_branch_id?: string | null
          target_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          priority?: string
          target_branch_id?: string | null
          target_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_target_branch_id_fkey"
            columns: ["target_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
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
      bottle_specifications: {
        Row: {
          bottle_size: string
          bottles_per_bale: number | null
          category: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          bottle_size: string
          bottles_per_bale?: number | null
          category: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          bottle_size?: string
          bottles_per_bale?: number | null
          category?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_factory: boolean
          location: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_factory?: boolean
          location?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_factory?: boolean
          location?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cash_reconciliations: {
        Row: {
          actual_data: Json
          actual_total: number
          approval_status: Database["public"]["Enums"]["reconciliation_status"]
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          cashier_id: string
          created_at: string
          difference: number
          expected_data: Json
          expected_total: number
          id: string
          reconciliation_date: string
          rejection_reason: string | null
          remarks: string | null
          shift: string
          status: string
          transaction_charges: number
          updated_at: string
        }
        Insert: {
          actual_data?: Json
          actual_total?: number
          approval_status?: Database["public"]["Enums"]["reconciliation_status"]
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          cashier_id: string
          created_at?: string
          difference?: number
          expected_data?: Json
          expected_total?: number
          id?: string
          reconciliation_date?: string
          rejection_reason?: string | null
          remarks?: string | null
          shift: string
          status: string
          transaction_charges?: number
          updated_at?: string
        }
        Update: {
          actual_data?: Json
          actual_total?: number
          approval_status?: Database["public"]["Enums"]["reconciliation_status"]
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          cashier_id?: string
          created_at?: string
          difference?: number
          expected_data?: Json
          expected_total?: number
          id?: string
          reconciliation_date?: string
          rejection_reason?: string | null
          remarks?: string | null
          shift?: string
          status?: string
          transaction_charges?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
      credit_payments: {
        Row: {
          amount: number
          balance_after: number
          branch_id: string | null
          created_at: string
          customer_id: string
          id: string
          mpesa_receipt: string | null
          notes: string | null
          payment_mode: string
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          balance_after: number
          branch_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          mpesa_receipt?: string | null
          notes?: string | null
          payment_mode?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          branch_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          mpesa_receipt?: string | null
          notes?: string | null
          payment_mode?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          finished_product_id: string | null
          good_bottles: number
          good_bottles_created: number | null
          id: string
          loose_bottles: number
          notes: string | null
          production_date: string
          raw_bottle_specification_id: string | null
          raw_bottles_consumed: number | null
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
          finished_product_id?: string | null
          good_bottles?: number
          good_bottles_created?: number | null
          id?: string
          loose_bottles?: number
          notes?: string | null
          production_date?: string
          raw_bottle_specification_id?: string | null
          raw_bottles_consumed?: number | null
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
          finished_product_id?: string | null
          good_bottles?: number
          good_bottles_created?: number | null
          id?: string
          loose_bottles?: number
          notes?: string | null
          production_date?: string
          raw_bottle_specification_id?: string | null
          raw_bottles_consumed?: number | null
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
          {
            foreignKeyName: "production_records_finished_product_id_fkey"
            columns: ["finished_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_records_raw_bottle_specification_id_fkey"
            columns: ["raw_bottle_specification_id"]
            isOneToOne: false
            referencedRelation: "bottle_specifications"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          bales: number
          bottle_size: string
          bottle_specification_id: string | null
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
          bottle_specification_id?: string | null
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
          bottle_specification_id?: string | null
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
            foreignKeyName: "products_bottle_specification_id_fkey"
            columns: ["bottle_specification_id"]
            isOneToOne: false
            referencedRelation: "bottle_specifications"
            referencedColumns: ["id"]
          },
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
          bales_purchased: number | null
          bottles_received: number | null
          branch_id: string | null
          buying_price: number
          created_at: string
          date: string
          id: string
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          product_id: string | null
          product_name: string
          purchase_unit: string | null
          quantity: number
          raw_bottle_specification_id: string | null
          recorded_by: string | null
          supplier_id: string | null
          supplier_name: string
          total_cost: number
        }
        Insert: {
          bales_purchased?: number | null
          bottles_received?: number | null
          branch_id?: string | null
          buying_price: number
          created_at?: string
          date?: string
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          product_id?: string | null
          product_name: string
          purchase_unit?: string | null
          quantity: number
          raw_bottle_specification_id?: string | null
          recorded_by?: string | null
          supplier_id?: string | null
          supplier_name: string
          total_cost: number
        }
        Update: {
          bales_purchased?: number | null
          bottles_received?: number | null
          branch_id?: string | null
          buying_price?: number
          created_at?: string
          date?: string
          id?: string
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          product_id?: string | null
          product_name?: string
          purchase_unit?: string | null
          quantity?: number
          raw_bottle_specification_id?: string | null
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
            foreignKeyName: "purchases_raw_bottle_specification_id_fkey"
            columns: ["raw_bottle_specification_id"]
            isOneToOne: false
            referencedRelation: "bottle_specifications"
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
      raw_bottle_inventory: {
        Row: {
          bottle_specification_id: string
          branch_id: string
          id: string
          quantity_bottles: number
          updated_at: string
        }
        Insert: {
          bottle_specification_id: string
          branch_id: string
          id?: string
          quantity_bottles?: number
          updated_at?: string
        }
        Update: {
          bottle_specification_id?: string
          branch_id?: string
          id?: string
          quantity_bottles?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_bottle_inventory_bottle_specification_id_fkey"
            columns: ["bottle_specification_id"]
            isOneToOne: false
            referencedRelation: "bottle_specifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_bottle_inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_bottle_inventory_logs: {
        Row: {
          bottle_specification_id: string
          branch_id: string
          created_at: string
          id: string
          movement_type: string
          production_record_id: string | null
          purchase_id: string | null
          quantity_bottles: number
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          bottle_specification_id: string
          branch_id: string
          created_at?: string
          id?: string
          movement_type: string
          production_record_id?: string | null
          purchase_id?: string | null
          quantity_bottles: number
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          bottle_specification_id?: string
          branch_id?: string
          created_at?: string
          id?: string
          movement_type?: string
          production_record_id?: string | null
          purchase_id?: string | null
          quantity_bottles?: number
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_bottle_inventory_logs_bottle_specification_id_fkey"
            columns: ["bottle_specification_id"]
            isOneToOne: false
            referencedRelation: "bottle_specifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_bottle_inventory_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_bottle_inventory_logs_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          branch_id: string | null
          buying_price: number
          created_at: string
          discount_amount: number
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number
          id: string
          product_id: string
          product_name: string
          profit: number
          quantity: number
          sale_id: string
          selling_price: number
          total_amount: number
        }
        Insert: {
          branch_id?: string | null
          buying_price: number
          created_at?: string
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number
          id?: string
          product_id: string
          product_name: string
          profit: number
          quantity: number
          sale_id: string
          selling_price: number
          total_amount: number
        }
        Update: {
          branch_id?: string | null
          buying_price?: number
          created_at?: string
          discount_amount?: number
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number
          id?: string
          product_id?: string
          product_name?: string
          profit?: number
          quantity?: number
          sale_id?: string
          selling_price?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
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
          inventory_applied: boolean
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
          inventory_applied?: boolean
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
          inventory_applied?: boolean
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
      stock_transfers: {
        Row: {
          approved_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          from_branch_id: string
          id: string
          product_id: string
          product_name: string
          quantity: number
          received_at: string | null
          received_by: string | null
          remarks: string | null
          status: string
          to_branch_id: string
          transfer_date: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          from_branch_id: string
          id?: string
          product_id: string
          product_name: string
          quantity: number
          received_at?: string | null
          received_by?: string | null
          remarks?: string | null
          status?: string
          to_branch_id: string
          transfer_date?: string
          transfer_number?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          from_branch_id?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          received_at?: string | null
          received_by?: string | null
          remarks?: string | null
          status?: string
          to_branch_id?: string
          transfer_date?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
      cancel_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      create_stock_transfer: {
        Args: {
          p_from_branch_id: string
          p_product_id: string
          p_quantity: number
          p_remarks?: string
          p_to_branch_id: string
        }
        Returns: string
      }
      finalize_sale_payment: { Args: { p_sale_id: string }; Returns: Json }
      get_active_announcements: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          priority: string
          target_branch_id: string | null
          target_type: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "announcements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
      next_stock_transfer_number: { Args: never; Returns: string }
      receive_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      record_bottle_production: {
        Args: {
          p_bottle_specification_id: string
          p_branch_id: string
          p_faulty: number
          p_finished_product_id: string
          p_notes?: string
          p_processed: number
          p_recorded_by: string
        }
        Returns: string
      }
      record_manual_mpesa_payment: {
        Args: {
          p_amount: number
          p_branch_id?: string
          p_message_reference?: string
          p_mpesa_receipt: string
          p_notes?: string
          p_payment_time?: string
          p_phone_number: string
          p_sale_id: string
        }
        Returns: Json
      }
      record_raw_bottle_purchase: {
        Args: {
          p_bales: number
          p_bottle_specification_id: string
          p_branch_id: string
          p_buying_price: number
          p_payment_mode: Database["public"]["Enums"]["payment_mode"]
          p_recorded_by: string
          p_supplier_id: string
          p_supplier_name: string
        }
        Returns: string
      }
      set_factory_branch: { Args: { p_branch_id: string }; Returns: undefined }
    }
    Enums: {
      adjustment_type: "increase" | "decrease"
      app_role: "superadmin" | "supervisor" | "cashier" | "stock_manager"
      approval_status: "pending" | "approved" | "rejected"
      discount_type: "percentage" | "fixed"
      payment_mode: "Cash" | "Mpesa" | "Credit"
      reconciliation_status: "Pending" | "Approved" | "Rejected"
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
      reconciliation_status: ["Pending", "Approved", "Rejected"],
    },
  },
} as const
