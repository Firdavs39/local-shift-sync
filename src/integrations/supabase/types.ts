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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_audit_log: {
        Row: {
          company_id: string
          endpoint: string
          error_code: string | null
          flagged: boolean
          id: number
          ip: unknown
          key_id: string | null
          latency_ms: number | null
          method: string
          query_hash: string | null
          response_rows: number | null
          status_code: number
          ts: string
          user_agent: string | null
        }
        Insert: {
          company_id: string
          endpoint: string
          error_code?: string | null
          flagged?: boolean
          id?: number
          ip?: unknown
          key_id?: string | null
          latency_ms?: number | null
          method?: string
          query_hash?: string | null
          response_rows?: number | null
          status_code: number
          ts?: string
          user_agent?: string | null
        }
        Update: {
          company_id?: string
          endpoint?: string
          error_code?: string | null
          flagged?: boolean
          id?: number
          ip?: unknown
          key_id?: string | null
          latency_ms?: number | null
          method?: string
          query_hash?: string | null
          response_rows?: number | null
          status_code?: number
          ts?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      api_key_events: {
        Row: {
          actor_ip: unknown
          actor_user: string | null
          company_id: string
          event: Database["public"]["Enums"]["api_key_event_type"]
          id: number
          key_id: string
          metadata: Json | null
          ts: string
        }
        Insert: {
          actor_ip?: unknown
          actor_user?: string | null
          company_id: string
          event: Database["public"]["Enums"]["api_key_event_type"]
          id?: number
          key_id: string
          metadata?: Json | null
          ts?: string
        }
        Update: {
          actor_ip?: unknown
          actor_user?: string | null
          company_id?: string
          event?: Database["public"]["Enums"]["api_key_event_type"]
          id?: number
          key_id?: string
          metadata?: Json | null
          ts?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          agent_type: string | null
          company_id: string
          created_at: string
          created_by: string | null
          daily_quota: number
          expires_at: string | null
          id: string
          intended_use: string | null
          ip_allowlist: unknown[] | null
          key_hash: string
          key_last4: string
          key_prefix: string
          last_used_at: string | null
          last_used_ip: unknown
          name: string
          purge_at: string | null
          rate_limit_rpm: number
          revoked_at: string | null
          rotated_to: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["api_key_status"]
        }
        Insert: {
          agent_type?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          daily_quota?: number
          expires_at?: string | null
          id?: string
          intended_use?: string | null
          ip_allowlist?: unknown[] | null
          key_hash: string
          key_last4: string
          key_prefix: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name: string
          purge_at?: string | null
          rate_limit_rpm?: number
          revoked_at?: string | null
          rotated_to?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["api_key_status"]
        }
        Update: {
          agent_type?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          daily_quota?: number
          expires_at?: string | null
          id?: string
          intended_use?: string | null
          ip_allowlist?: unknown[] | null
          key_hash?: string
          key_last4?: string
          key_prefix?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name?: string
          purge_at?: string | null
          rate_limit_rpm?: number
          revoked_at?: string | null
          rotated_to?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["api_key_status"]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_rotated_to_fkey"
            columns: ["rotated_to"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_api_secrets: {
        Row: {
          created_at: string
          id: number
          pepper: string
        }
        Insert: {
          created_at?: string
          id?: number
          pepper: string
        }
        Update: {
          created_at?: string
          id?: number
          pepper?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          max_workers: number
          name: string
          owner_user_id: string | null
          plan: string
          plan_expires_at: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          max_workers?: number
          name: string
          owner_user_id?: string | null
          plan?: string
          plan_expires_at?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          max_workers?: number
          name?: string
          owner_user_id?: string | null
          plan?: string
          plan_expires_at?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          pin: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          pin: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          pin?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          capacity: number
          daily_reset: string
          daily_used: number
          key_id: string
          last_refill: string
          refill_rate: number
          tokens: number
        }
        Insert: {
          capacity: number
          daily_reset?: string
          daily_used?: number
          key_id: string
          last_refill?: string
          refill_rate: number
          tokens: number
        }
        Update: {
          capacity?: number
          daily_reset?: string
          daily_used?: number
          key_id?: string
          last_refill?: string
          refill_rate?: number
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_buckets_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: true
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          accuracy_cap_m: number
          company_id: string | null
          id: string
          max_users: number
          purge_policy_days: number
          updated_at: string
        }
        Insert: {
          accuracy_cap_m?: number
          company_id?: string | null
          id: string
          max_users?: number
          purge_policy_days?: number
          updated_at?: string
        }
        Update: {
          accuracy_cap_m?: number
          company_id?: string | null
          id?: string
          max_users?: number
          purge_policy_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          auto_ended: boolean | null
          company_id: string | null
          created_at: string
          end_lat: number | null
          end_lon: number | null
          ended_at: string | null
          id: string
          is_overtime: boolean | null
          is_paused: boolean | null
          minutes_late: number
          minutes_worked: number | null
          pause_history: Json | null
          paused_at: string | null
          site_id: string
          start_lat: number
          start_lon: number
          started_at: string
          status: Database["public"]["Enums"]["shift_status"]
          total_paused_minutes: number | null
          user_id: string
        }
        Insert: {
          auto_ended?: boolean | null
          company_id?: string | null
          created_at?: string
          end_lat?: number | null
          end_lon?: number | null
          ended_at?: string | null
          id?: string
          is_overtime?: boolean | null
          is_paused?: boolean | null
          minutes_late?: number
          minutes_worked?: number | null
          pause_history?: Json | null
          paused_at?: string | null
          site_id: string
          start_lat: number
          start_lon: number
          started_at: string
          status: Database["public"]["Enums"]["shift_status"]
          total_paused_minutes?: number | null
          user_id: string
        }
        Update: {
          auto_ended?: boolean | null
          company_id?: string | null
          created_at?: string
          end_lat?: number | null
          end_lon?: number | null
          ended_at?: string | null
          id?: string
          is_overtime?: boolean | null
          is_paused?: boolean | null
          minutes_late?: number
          minutes_worked?: number | null
          pause_history?: Json | null
          paused_at?: string | null
          site_id?: string
          start_lat?: number
          start_lon?: number
          started_at?: string
          status?: Database["public"]["Enums"]["shift_status"]
          total_paused_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          expected_end: string
          expected_start: string
          id: string
          lat: number
          lon: number
          name: string
          radius_m: number
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          expected_end: string
          expected_start: string
          id?: string
          lat: number
          lon: number
          name: string
          radius_m: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          expected_end?: string
          expected_start?: string
          id?: string
          lat?: number
          lon?: number
          name?: string
          radius_m?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_config: {
        Row: {
          bot_token: string
          chat_id: string
          company_id: string
          created_at: string
          id: string
          notify_late: boolean
        }
        Insert: {
          bot_token: string
          chat_id: string
          company_id: string
          created_at?: string
          id?: string
          notify_late?: boolean
        }
        Update: {
          bot_token?: string
          chat_id?: string
          company_id?: string
          created_at?: string
          id?: string
          notify_late?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "telegram_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_site_assignments: {
        Row: {
          company_id: string
          created_at: string
          expected_end: string | null
          expected_start: string | null
          id: string
          site_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expected_end?: string | null
          expected_start?: string | null
          id?: string
          site_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expected_end?: string | null
          expected_start?: string | null
          id?: string
          site_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_site_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_site_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_site_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      am_i_first_today: { Args: { tz?: string }; Returns: boolean }
      cleanup_audit_log: { Args: never; Returns: number }
      consume_rate_limit_token: {
        Args: { p_cost?: number; p_key_id: string }
        Returns: {
          allowed: boolean
          retry_after: number
          tokens_left: number
        }[]
      }
      count_active_api_keys: { Args: { p_company_id: string }; Returns: number }
      get_api_key_pepper: { Args: never; Returns: string }
      get_api_tier_limits: {
        Args: { p_company_id: string }
        Returns: {
          audit_days: number
          daily_quota: number
          max_keys: number
          rate_limit_rpm: number
        }[]
      }
      get_my_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          company_id: string
          daily_quota: number
          expired: boolean
          id: string
          ip_allowlist: unknown[]
          rate_limit_rpm: number
          scopes: string[]
        }[]
      }
      purge_old_revoked_keys: { Args: never; Returns: number }
    }
    Enums: {
      api_key_event_type:
        | "created"
        | "revoked"
        | "rotated"
        | "restored"
        | "scope_changed"
        | "renamed"
      api_key_status: "active" | "revoked" | "purged"
      app_role: "admin" | "worker"
      shift_status: "early" | "on_time" | "late" | "offsite"
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
      api_key_event_type: [
        "created",
        "revoked",
        "rotated",
        "restored",
        "scope_changed",
        "renamed",
      ],
      api_key_status: [
        "active",
        "revoked",
        "purged",
      ],
      app_role: [
        "admin",
        "worker",
      ],
      shift_status: [
        "early",
        "on_time",
        "late",
        "offsite",
      ],
    },
  },
} as const
