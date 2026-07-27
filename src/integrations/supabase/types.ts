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
      clients: {
        Row: {
          address: string | null
          balance: number
          billing_day: number
          city: string | null
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          billing_day?: number
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          billing_day?: number
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          phone: string | null
          role: string
          salary: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          role?: string
          salary?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          phone?: string | null
          role?: string
          salary?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
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
      routers: {
        Row: {
          api_password: string | null
          api_port: number | null
          api_user: string | null
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
          monthly_price: number | null
          notes: string | null
          plan_id: string
          pppoe_password: string | null
          pppoe_user: string | null
          previous_profile: string | null
          queue_target: string | null
          router_id: string | null
          service_type: string
          status: string
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
          monthly_price?: number | null
          notes?: string | null
          plan_id: string
          pppoe_password?: string | null
          pppoe_user?: string | null
          previous_profile?: string | null
          queue_target?: string | null
          router_id?: string | null
          service_type?: string
          status?: string
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
          monthly_price?: number | null
          notes?: string | null
          plan_id?: string
          pppoe_password?: string | null
          pppoe_user?: string | null
          previous_profile?: string | null
          queue_target?: string | null
          router_id?: string | null
          service_type?: string
          status?: string
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: [
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
      tickets: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_monthly_invoices: {
        Args: { p_month?: number; p_year?: number }
        Returns: number
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
