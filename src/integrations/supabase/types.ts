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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounting_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          entry_date: string
          entry_type: string
          id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          entry_date?: string
          entry_type: string
          id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          entry_date?: string
          entry_type?: string
          id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          default_grace_days: number
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          default_grace_days?: number
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          default_grace_days?: number
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bulk_change_templates: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          params: Json
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          params?: Json
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          params?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          method: string | null
          payment_id: string | null
          reference_id: string | null
          register_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          method?: string | null
          payment_id?: string | null
          reference_id?: string | null
          register_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          method?: string | null
          payment_id?: string | null
          reference_id?: string | null
          register_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          branch_id: string | null
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          created_at: string
          difference: number | null
          expected_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          status: string
        }
        Insert: {
          branch_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          status?: string
        }
        Update: {
          branch_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          created_at?: string
          difference?: number | null
          expected_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      client_actions: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          detail: string | null
          id: string
          performed_by: string | null
          service_id: string | null
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          performed_by?: string | null
          service_id?: string | null
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          performed_by?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_actions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          portal_user_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          portal_user_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          portal_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_sessions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "client_portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          last_login: string | null
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_login?: string | null
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          balance: number
          billing_config: Json
          billing_day: number
          branch_id: string | null
          city: string | null
          created_at: string
          cutoff_policy_id: string | null
          document: string | null
          dont_cut: boolean
          email: string | null
          full_name: string
          grace_days_override: number | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          payment_promise_until: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          billing_config?: Json
          billing_day?: number
          branch_id?: string | null
          city?: string | null
          created_at?: string
          cutoff_policy_id?: string | null
          document?: string | null
          dont_cut?: boolean
          email?: string | null
          full_name: string
          grace_days_override?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          payment_promise_until?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          billing_config?: Json
          billing_day?: number
          branch_id?: string | null
          city?: string | null
          created_at?: string
          cutoff_policy_id?: string | null
          document?: string | null
          dont_cut?: boolean
          email?: string | null
          full_name?: string
          grace_days_override?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          payment_promise_until?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_cutoff_policy_id_fkey"
            columns: ["cutoff_policy_id"]
            isOneToOne: false
            referencedRelation: "cutoff_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          base_amount: number
          commission_amount: number
          created_at: string
          id: string
          paid_at: string | null
          percent: number
          period_month: number
          period_year: number
          status: string
          user_id: string
        }
        Insert: {
          base_amount?: number
          commission_amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          percent?: number
          period_month: number
          period_year: number
          status?: string
          user_id: string
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          percent?: number
          period_month?: number
          period_year?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cutoff_leaks: {
        Row: {
          client_id: string
          connections: number
          created_at: string
          detected_at: string
          id: string
          resolved: boolean
          resolved_at: string | null
          sample: Json | null
          service_id: string
          traffic_bytes: number
        }
        Insert: {
          client_id: string
          connections?: number
          created_at?: string
          detected_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          sample?: Json | null
          service_id: string
          traffic_bytes?: number
        }
        Update: {
          client_id?: string
          connections?: number
          created_at?: string
          detected_at?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          sample?: Json | null
          service_id?: string
          traffic_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "cutoff_leaks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cutoff_leaks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cutoff_leaks_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      cutoff_policies: {
        Row: {
          auto_suspend: boolean
          created_at: string
          cut_hour: number
          cut_mode: string
          description: string | null
          grace_days: number
          id: string
          is_active: boolean
          is_default: boolean
          late_fee: number
          name: string
          notify_email: boolean
          notify_sms: boolean
          notify_whatsapp: boolean
          prior_notice_hours: number
          reconnect_fee: number
          speed_reduced_kbps: number | null
          updated_at: string
        }
        Insert: {
          auto_suspend?: boolean
          created_at?: string
          cut_hour?: number
          cut_mode?: string
          description?: string | null
          grace_days?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          late_fee?: number
          name: string
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          prior_notice_hours?: number
          reconnect_fee?: number
          speed_reduced_kbps?: number | null
          updated_at?: string
        }
        Update: {
          auto_suspend?: boolean
          created_at?: string
          cut_hour?: number
          cut_mode?: string
          description?: string | null
          grace_days?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          late_fee?: number
          name?: string
          notify_email?: boolean
          notify_sms?: boolean
          notify_whatsapp?: boolean
          prior_notice_hours?: number
          reconnect_fee?: number
          speed_reduced_kbps?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          access_days: string[]
          access_from: string
          access_to: string
          branch_id: string | null
          commission_pct: number
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          operator_type: string
          permissions: Json
          phone: string | null
          role: string
          router_ids: string[]
          salary: number
          status: string
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          access_days?: string[]
          access_from?: string
          access_to?: string
          branch_id?: string | null
          commission_pct?: number
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          operator_type?: string
          permissions?: Json
          phone?: string | null
          role?: string
          router_ids?: string[]
          salary?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          access_days?: string[]
          access_from?: string
          access_to?: string
          branch_id?: string | null
          commission_pct?: number
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          operator_type?: string
          permissions?: Json
          phone?: string | null
          role?: string
          router_ids?: string[]
          salary?: number
          status?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fiber_links: {
        Row: {
          cable_type: string | null
          created_at: string
          fibers: number | null
          from_node: string
          id: string
          length_m: number | null
          notes: string | null
          to_node: string
          updated_at: string
        }
        Insert: {
          cable_type?: string | null
          created_at?: string
          fibers?: number | null
          from_node: string
          id?: string
          length_m?: number | null
          notes?: string | null
          to_node: string
          updated_at?: string
        }
        Update: {
          cable_type?: string | null
          created_at?: string
          fibers?: number | null
          from_node?: string
          id?: string
          length_m?: number | null
          notes?: string | null
          to_node?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiber_links_from_node_fkey"
            columns: ["from_node"]
            isOneToOne: false
            referencedRelation: "network_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiber_links_to_node_fkey"
            columns: ["to_node"]
            isOneToOne: false
            referencedRelation: "network_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      hotspot_vouchers: {
        Row: {
          batch_id: string
          created_at: string
          data_limit: string | null
          id: string
          password: string
          price: number | null
          profile: string
          router_id: string | null
          status: string
          time_limit: string | null
          used_at: string | null
          username: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          data_limit?: string | null
          id?: string
          password: string
          price?: number | null
          profile: string
          router_id?: string | null
          status?: string
          time_limit?: string | null
          used_at?: string | null
          username: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          data_limit?: string | null
          id?: string
          password?: string
          price?: number | null
          profile?: string
          router_id?: string | null
          status?: string
          time_limit?: string | null
          used_at?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotspot_vouchers_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string
          created_at: string
          id: string
          location: string | null
          name: string
          quantity: number
          serial: string | null
          status: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          location?: string | null
          name: string
          quantity?: number
          serial?: string | null
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          quantity?: number
          serial?: string | null
          status?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_serials: {
        Row: {
          assigned_at: string | null
          assigned_client_id: string | null
          assigned_service_id: string | null
          created_at: string
          id: string
          item_id: string | null
          mac_address: string | null
          notes: string | null
          serial: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_client_id?: string | null
          assigned_service_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          mac_address?: string | null
          notes?: string | null
          serial: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_client_id?: string | null
          assigned_service_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          mac_address?: string | null
          notes?: string | null
          serial?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_serials_assigned_client_id_fkey"
            columns: ["assigned_client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "inventory_serials_assigned_client_id_fkey"
            columns: ["assigned_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_assigned_service_id_fkey"
            columns: ["assigned_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          concept: string | null
          created_at: string
          days_overdue: number
          due_date: string
          id: string
          invoice_number: number
          paid_at: string | null
          period_month: number | null
          period_year: number | null
          service_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          concept?: string | null
          created_at?: string
          days_overdue?: number
          due_date: string
          id?: string
          invoice_number?: number
          paid_at?: string | null
          period_month?: number | null
          period_year?: number | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          concept?: string | null
          created_at?: string
          days_overdue?: number
          due_date?: string
          id?: string
          invoice_number?: number
          paid_at?: string | null
          period_month?: number | null
          period_year?: number | null
          service_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          attempt: number
          created_at: string
          detail: Json | null
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          job_name: string
          started_at: string
          status: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name: string
          started_at?: string
          status?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          detail?: Json | null
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job_name?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string | null
          assigned_to: string | null
          city: string | null
          converted_client_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          interested_plan_id: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          converted_client_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          interested_plan_id?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          converted_client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          interested_plan_id?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_interested_plan_id_fkey"
            columns: ["interested_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      license_activations: {
        Row: {
          created_at: string
          event: string
          hostname: string | null
          id: string
          ip: string | null
          license_id: string | null
          license_key: string
          message: string | null
          result: string
        }
        Insert: {
          created_at?: string
          event: string
          hostname?: string | null
          id?: string
          ip?: string | null
          license_id?: string | null
          license_key: string
          message?: string | null
          result: string
        }
        Update: {
          created_at?: string
          event?: string
          hostname?: string | null
          id?: string
          ip?: string | null
          license_id?: string | null
          license_key?: string
          message?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_activations_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      license_state: {
        Row: {
          expires_at: string | null
          id: number
          last_token: string | null
          last_verified_at: string | null
          license_key: string | null
          max_clients: number | null
          max_routers: number | null
          plan: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          id?: number
          last_token?: string | null
          last_verified_at?: string | null
          license_key?: string | null
          max_clients?: number | null
          max_routers?: number | null
          plan?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          id?: number
          last_token?: string | null
          last_verified_at?: string | null
          license_key?: string | null
          max_clients?: number | null
          max_routers?: number | null
          plan?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          activated_at: string | null
          bound_hostname: string | null
          bound_ip: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          expires_at: string | null
          id: string
          key: string
          last_heartbeat_at: string | null
          max_clients: number
          max_routers: number
          notes: string | null
          plan: string
          price_paid: number | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          bound_hostname?: string | null
          bound_ip?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          key: string
          last_heartbeat_at?: string | null
          max_clients?: number
          max_routers?: number
          notes?: string | null
          plan?: string
          price_paid?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          bound_hostname?: string | null
          bound_ip?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          key?: string
          last_heartbeat_at?: string | null
          max_clients?: number
          max_routers?: number
          notes?: string | null
          plan?: string
          price_paid?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          recipients_count: number
          sent_at: string
          status: string
          subject: string | null
          target: string | null
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string
          id?: string
          recipients_count?: number
          sent_at?: string
          status?: string
          subject?: string | null
          target?: string | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          recipients_count?: number
          sent_at?: string
          status?: string
          subject?: string | null
          target?: string | null
        }
        Relationships: []
      }
      network_nodes: {
        Row: {
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          notes: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name: string
          notes?: string | null
          status?: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          notes?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      operator_2fa: {
        Row: {
          created_at: string
          enabled: boolean
          recovery_codes: string[] | null
          secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          recovery_codes?: string[] | null
          secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          recovery_codes?: string[] | null
          secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount: number
          checkout_url: string | null
          client_id: string
          created_at: string
          currency: string
          external_id: string | null
          id: string
          invoice_id: string
          metadata: Json
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_url?: string | null
          client_id: string
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payment_intents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          method: string
          notes: string | null
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll: {
        Row: {
          base_salary: number
          bonuses: number
          created_at: string
          deductions: number
          employee_id: string
          id: string
          net_amount: number
          paid_at: string | null
          period: string
          status: string
        }
        Insert: {
          base_salary: number
          bonuses?: number
          created_at?: string
          deductions?: number
          employee_id: string
          id?: string
          net_amount: number
          paid_at?: string | null
          period: string
          status?: string
        }
        Update: {
          base_salary?: number
          bonuses?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          id?: string
          net_amount?: number
          paid_at?: string | null
          period?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          burst_enabled: boolean
          created_at: string
          description: string | null
          download_mbps: number
          id: string
          mikrotik_profile_name: string | null
          name: string
          price: number
          synced_at: string | null
          updated_at: string
          upload_mbps: number
        }
        Insert: {
          active?: boolean
          burst_enabled?: boolean
          created_at?: string
          description?: string | null
          download_mbps: number
          id?: string
          mikrotik_profile_name?: string | null
          name: string
          price: number
          synced_at?: string | null
          updated_at?: string
          upload_mbps: number
        }
        Update: {
          active?: boolean
          burst_enabled?: boolean
          created_at?: string
          description?: string | null
          download_mbps?: number
          id?: string
          mikrotik_profile_name?: string | null
          name?: string
          price?: number
          synced_at?: string | null
          updated_at?: string
          upload_mbps?: number
        }
        Relationships: []
      }
      portal_settings: {
        Row: {
          company_name: string
          custom_html: string | null
          footer_note: string
          id: boolean
          logo_url: string | null
          message: string
          phone: string
          primary_color: string
          secondary_color: string
          subtitle: string
          template_base_url: string | null
          title: string
          updated_at: string
          use_custom_html: boolean
          whatsapp: string
          whatsapp_message: string
        }
        Insert: {
          company_name?: string
          custom_html?: string | null
          footer_note?: string
          id?: boolean
          logo_url?: string | null
          message?: string
          phone?: string
          primary_color?: string
          secondary_color?: string
          subtitle?: string
          template_base_url?: string | null
          title?: string
          updated_at?: string
          use_custom_html?: boolean
          whatsapp?: string
          whatsapp_message?: string
        }
        Update: {
          company_name?: string
          custom_html?: string | null
          footer_note?: string
          id?: boolean
          logo_url?: string | null
          message?: string
          phone?: string
          primary_color?: string
          secondary_color?: string
          subtitle?: string
          template_base_url?: string | null
          title?: string
          updated_at?: string
          use_custom_html?: boolean
          whatsapp?: string
          whatsapp_message?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      radius_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          password: string
          profile: string | null
          service_id: string
          synced_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          password: string
          profile?: string | null
          service_id: string
          synced_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          password?: string
          profile?: string | null
          service_id?: string
          synced_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "radius_users_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      router_ip_pools: {
        Row: {
          cidr: string | null
          created_at: string
          gateway: string | null
          id: string
          is_default: boolean
          name: string
          ranges: string | null
          router_id: string
          source: string
          updated_at: string
        }
        Insert: {
          cidr?: string | null
          created_at?: string
          gateway?: string | null
          id?: string
          is_default?: boolean
          name: string
          ranges?: string | null
          router_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          cidr?: string | null
          created_at?: string
          gateway?: string | null
          id?: string
          is_default?: boolean
          name?: string
          ranges?: string | null
          router_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "router_ip_pools_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      routers: {
        Row: {
          api_password: string | null
          api_port: number | null
          api_user: string | null
          client_pool_cidr: string | null
          client_pool_gateway: string | null
          created_at: string
          id: string
          ip_address: string
          last_sync_at: string | null
          location: string | null
          morosos_profile: string
          name: string
          notes: string | null
          simulated: boolean
          status: string
          type: string
          updated_at: string
          walled_garden_ip: string | null
        }
        Insert: {
          api_password?: string | null
          api_port?: number | null
          api_user?: string | null
          client_pool_cidr?: string | null
          client_pool_gateway?: string | null
          created_at?: string
          id?: string
          ip_address: string
          last_sync_at?: string | null
          location?: string | null
          morosos_profile?: string
          name: string
          notes?: string | null
          simulated?: boolean
          status?: string
          type?: string
          updated_at?: string
          walled_garden_ip?: string | null
        }
        Update: {
          api_password?: string | null
          api_port?: number | null
          api_user?: string | null
          client_pool_cidr?: string | null
          client_pool_gateway?: string | null
          created_at?: string
          id?: string
          ip_address?: string
          last_sync_at?: string | null
          location?: string | null
          morosos_profile?: string
          name?: string
          notes?: string | null
          simulated?: boolean
          status?: string
          type?: string
          updated_at?: string
          walled_garden_ip?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          auto_suspend: boolean
          client_id: string
          created_at: string
          hotspot_password: string | null
          hotspot_user: string | null
          id: string
          installation_address: string | null
          installation_date: string | null
          ip_address: string | null
          last_billed_month: string | null
          mac_address: string | null
          mikrotik_synced_at: string | null
          monthly_price: number | null
          notes: string | null
          plan_id: string
          pppoe_password: string | null
          pppoe_user: string | null
          previous_profile: string | null
          queue_target: string | null
          router_id: string | null
          scheduled_suspend_at: string | null
          service_type: string
          status: string
          suspend_reason: string | null
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          auto_suspend?: boolean
          client_id: string
          created_at?: string
          hotspot_password?: string | null
          hotspot_user?: string | null
          id?: string
          installation_address?: string | null
          installation_date?: string | null
          ip_address?: string | null
          last_billed_month?: string | null
          mac_address?: string | null
          mikrotik_synced_at?: string | null
          monthly_price?: number | null
          notes?: string | null
          plan_id: string
          pppoe_password?: string | null
          pppoe_user?: string | null
          previous_profile?: string | null
          queue_target?: string | null
          router_id?: string | null
          scheduled_suspend_at?: string | null
          service_type?: string
          status?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_suspend?: boolean
          client_id?: string
          created_at?: string
          hotspot_password?: string | null
          hotspot_user?: string | null
          id?: string
          installation_address?: string | null
          installation_date?: string | null
          ip_address?: string | null
          last_billed_month?: string | null
          mac_address?: string | null
          mikrotik_synced_at?: string | null
          monthly_price?: number | null
          notes?: string | null
          plan_id?: string
          pppoe_password?: string | null
          pppoe_user?: string | null
          previous_profile?: string | null
          queue_target?: string | null
          router_id?: string | null
          scheduled_suspend_at?: string | null
          service_type?: string
          status?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          plan_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          plan_id: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          plan_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          author_id: string | null
          author_name: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          last_reply_at: string | null
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_reply_at?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_reply_at?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      vpn_peers: {
        Row: {
          allowed_ips: unknown
          assigned_ip: unknown
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          private_key: string
          public_key: string
          router_id: string | null
          server_id: string
          sstp_password: string | null
          sstp_user: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_ips?: unknown
          assigned_ip: unknown
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          private_key: string
          public_key: string
          router_id?: string | null
          server_id: string
          sstp_password?: string | null
          sstp_user?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_ips?: unknown
          assigned_ip?: unknown
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          private_key?: string
          public_key?: string
          router_id?: string | null
          server_id?: string
          sstp_password?: string | null
          sstp_user?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vpn_peers_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vpn_peers_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "vpn_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      vpn_servers: {
        Row: {
          created_at: string | null
          dns: string | null
          endpoint: string
          id: string
          ipsec_secret: string | null
          is_active: boolean
          network: unknown
          port: number
          post_down: string | null
          post_up: string | null
          server_ip: unknown
          server_private_key: string
          server_public_key: string
          updated_at: string | null
          vpn_type: string
        }
        Insert: {
          created_at?: string | null
          dns?: string | null
          endpoint: string
          id?: string
          ipsec_secret?: string | null
          is_active?: boolean
          network?: unknown
          port?: number
          post_down?: string | null
          post_up?: string | null
          server_ip?: unknown
          server_private_key: string
          server_public_key: string
          updated_at?: string | null
          vpn_type?: string
        }
        Update: {
          created_at?: string | null
          dns?: string | null
          endpoint?: string
          id?: string
          ipsec_secret?: string | null
          is_active?: boolean
          network?: unknown
          port?: number
          post_down?: string | null
          post_up?: string | null
          server_ip?: unknown
          server_private_key?: string
          server_public_key?: string
          updated_at?: string | null
          vpn_type?: string
        }
        Relationships: []
      }
      work_orders: {
        Row: {
          assigned_to: string | null
          branch_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          evidence_url: string | null
          id: string
          notes: string | null
          priority: string
          scheduled_at: string | null
          service_id: string | null
          signature_data: string | null
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          priority?: string
          scheduled_at?: string | null
          service_id?: string | null
          signature_data?: string | null
          status?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          priority?: string
          scheduled_at?: string | null
          service_id?: string | null
          signature_data?: string | null
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_cutoff_history"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "work_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_cutoff_history: {
        Row: {
          classification: string | null
          client_id: string | null
          full_name: string | null
          last_cut_at: string | null
          last_reactivation_at: string | null
          total_cuts: number | null
          total_reactivations: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cutoff_daily_series: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          cuts: number
          day: string
          reactivations: number
        }[]
      }
      cutoff_dashboard: {
        Args: never
        Returns: {
          client_id: string
          days_cut: number
          debt: number
          document: string
          dont_cut: boolean
          full_name: string
          ip_address: string
          overdue_invoices: number
          phone: string
          plan_name: string
          promise_until: string
          router_name: string
          service_id: string
          suspend_reason: string
          suspended_at: string
        }[]
      }
      cutoff_kpis: { Args: never; Returns: Json }
      cutoff_recovery_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      cutoff_reincidence_report: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          classification: string
          client_id: string
          cuts: number
          full_name: string
          last_cut_at: string
          phone: string
          reactivations: number
        }[]
      }
      expire_payment_promises: { Args: never; Returns: number }
      finance_daily_series: {
        Args: { p_from?: string; p_operator?: string; p_to?: string }
        Returns: {
          day: string
          expense: number
          income: number
          tx_count: number
        }[]
      }
      finance_kpis: {
        Args: { p_from?: string; p_operator?: string; p_to?: string }
        Returns: Json
      }
      finance_operators: {
        Args: never
        Returns: {
          email: string
          full_name: string
          total_payments: number
          user_id: string
        }[]
      }
      finance_top_clients: {
        Args: {
          p_from?: string
          p_limit?: number
          p_operator?: string
          p_to?: string
        }
        Returns: {
          client_id: string
          full_name: string
          last_paid: string
          payments: number
          total: number
        }[]
      }
      generate_license_key: { Args: never; Returns: string }
      generate_monthly_invoices: {
        Args: { p_month?: number; p_year?: number }
        Returns: number
      }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_overdue_invoices: { Args: { p_grace_days?: number }; Returns: Json }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "supervisor"
        | "cajero"
        | "tecnico"
        | "vendedor"
        | "soporte"
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
      app_role: [
        "admin",
        "user",
        "supervisor",
        "cajero",
        "tecnico",
        "vendedor",
        "soporte",
      ],
    },
  },
} as const
