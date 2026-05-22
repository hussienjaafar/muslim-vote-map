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
      access_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          organization: string
          organization_id: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string
          status_token: string
          title: string | null
          updated_at: string
          use_case: string
          website: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          organization: string
          organization_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          status_token?: string
          title?: string | null
          updated_at?: string
          use_case: string
          website?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          organization?: string
          organization_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          status_token?: string
          title?: string | null
          updated_at?: string
          use_case?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          title: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          title?: string
          type?: string
        }
        Relationships: []
      }
      client_organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          seat_limit: number
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          seat_limit?: number
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          seat_limit?: number
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_cart_items: {
        Row: {
          created_at: string | null
          geo_code: string
          geo_label: string | null
          geo_name: string | null
          geo_type: string
          id: string
          organization_id: string | null
          product_id: string
          quantity: number | null
          record_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          geo_code: string
          geo_label?: string | null
          geo_name?: string | null
          geo_type: string
          id?: string
          organization_id?: string | null
          product_id: string
          quantity?: number | null
          record_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          geo_code?: string
          geo_label?: string | null
          geo_name?: string | null
          geo_type?: string
          id?: string
          organization_id?: string | null
          product_id?: string
          quantity?: number | null
          record_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_cart_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
        ]
      }
      data_order_items: {
        Row: {
          created_at: string
          geo_code: string
          geo_name: string | null
          geo_type: string
          id: string
          order_id: string
          product_id: string
          record_count: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          geo_code: string
          geo_name?: string | null
          geo_type: string
          id?: string
          order_id: string
          product_id: string
          record_count?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          geo_code?: string
          geo_name?: string | null
          geo_type?: string
          id?: string
          order_id?: string
          product_id?: string
          record_count?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "data_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "data_products"
            referencedColumns: ["id"]
          },
        ]
      }
      data_orders: {
        Row: {
          admin_notes: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          delivery_email: string | null
          fulfilled_at: string | null
          id: string
          organization_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          delivery_email?: string | null
          fulfilled_at?: string | null
          id?: string
          organization_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          delivery_email?: string | null
          fulfilled_at?: string | null
          id?: string
          organization_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_products: {
        Row: {
          active: boolean | null
          data_fields: string[] | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price_cents: number
          price_per_record: number | null
          product_type: string
          slug: string | null
          source_field: string | null
        }
        Insert: {
          active?: boolean | null
          data_fields?: string[] | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_cents: number
          price_per_record?: number | null
          product_type: string
          slug?: string | null
          source_field?: string | null
        }
        Update: {
          active?: boolean | null
          data_fields?: string[] | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_cents?: number
          price_per_record?: number | null
          product_type?: string
          slug?: string | null
          source_field?: string | null
        }
        Relationships: []
      }
      dismissed_announcements: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_announcements_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      invited_emails: {
        Row: {
          accepted_at: string | null
          email: string
          id: string
          invited_at: string
          invited_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
        }
        Relationships: []
      }
      issue_donor_districts: {
        Row: {
          cd_code: string
          created_at: string
          district_num: number
          gold_addresses: number
          gold_cell_phones: number
          gold_donors: number
          id: string
          issue_id: string
          silver_addresses: number
          silver_cell_phones: number
          silver_donors: number
          state_code: string
          total_donors: number | null
          updated_at: string
        }
        Insert: {
          cd_code: string
          created_at?: string
          district_num: number
          gold_addresses?: number
          gold_cell_phones?: number
          gold_donors?: number
          id?: string
          issue_id: string
          silver_addresses?: number
          silver_cell_phones?: number
          silver_donors?: number
          state_code: string
          total_donors?: number | null
          updated_at?: string
        }
        Update: {
          cd_code?: string
          created_at?: string
          district_num?: number
          gold_addresses?: number
          gold_cell_phones?: number
          gold_donors?: number
          id?: string
          issue_id?: string
          silver_addresses?: number
          silver_cell_phones?: number
          silver_donors?: number
          state_code?: string
          total_donors?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_donor_districts_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_donor_states: {
        Row: {
          created_at: string
          district_count: number
          gold_addresses: number
          gold_cell_phones: number
          gold_donors: number
          id: string
          issue_id: string
          silver_addresses: number
          silver_cell_phones: number
          silver_donors: number
          state_code: string
          total_donors: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          district_count?: number
          gold_addresses?: number
          gold_cell_phones?: number
          gold_donors?: number
          id?: string
          issue_id: string
          silver_addresses?: number
          silver_cell_phones?: number
          silver_donors?: number
          state_code: string
          total_donors?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          district_count?: number
          gold_addresses?: number
          gold_cell_phones?: number
          gold_donors?: number
          id?: string
          issue_id?: string
          silver_addresses?: number
          silver_cell_phones?: number
          silver_donors?: number
          state_code?: string
          total_donors?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_donor_states_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_published: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_published?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_published?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          has_completed_tour: boolean
          id: string
          organization: string | null
          phone: string | null
          suspended: boolean
          suspended_at: string | null
          suspended_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          has_completed_tour?: boolean
          id: string
          organization?: string | null
          phone?: string | null
          suspended?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          has_completed_tour?: boolean
          id?: string
          organization?: string | null
          phone?: string | null
          suspended?: boolean
          suspended_at?: string | null
          suspended_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_lists: {
        Row: {
          created_at: string
          id: string
          items: Json
          name: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          name: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          name?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_regions: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          region_code: string
          region_name: string | null
          region_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          region_code: string
          region_name?: string | null
          region_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          region_code?: string
          region_name?: string | null
          region_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_regions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_change_log: {
        Row: {
          changed_by: string | null
          created_at: string
          delta: number
          id: string
          new_limit: number
          organization_id: string
          previous_limit: number
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          delta: number
          id?: string
          new_limit: number
          organization_id: string
          previous_limit: number
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          delta?: number
          id?: string
          new_limit?: number
          organization_id?: string
          previous_limit?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seat_change_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          current_seat_limit: number
          id: string
          organization_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          requested_by: string
          requested_seats: number
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          current_seat_limit: number
          id?: string
          organization_id: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by: string
          requested_seats: number
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          current_seat_limit?: number
          id?: string
          organization_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string
          requested_seats?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "client_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          region: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          region?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          region?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voter_impact_districts: {
        Row: {
          actual_turnout_pct: number | null
          can_impact: boolean | null
          cd_code: string
          cell_phones: number | null
          cost_estimate: number | null
          didnt_vote_2024: number | null
          district_num: number
          donor_gold_count: number | null
          donor_platinum_count: number | null
          donor_silver_count: number | null
          households: number | null
          id: string
          margin_pct: number | null
          margin_votes: number | null
          muslim_registered: number | null
          muslim_unregistered: number | null
          muslim_voters: number
          political_activists: number | null
          political_donors: number | null
          primary_2022: number | null
          primary_2022_pct: number | null
          primary_2024: number | null
          primary_2024_pct: number | null
          registration_pct: number | null
          runner_up: string | null
          runner_up_party: string | null
          runner_up_votes: number | null
          state_code: string
          total_votes: number | null
          turnout_2022_pct: number | null
          turnout_pct: number | null
          voted_2022: number | null
          voted_2024: number | null
          votes_needed: number | null
          winner: string | null
          winner_party: string | null
          winner_votes: number | null
        }
        Insert: {
          actual_turnout_pct?: number | null
          can_impact?: boolean | null
          cd_code: string
          cell_phones?: number | null
          cost_estimate?: number | null
          didnt_vote_2024?: number | null
          district_num: number
          donor_gold_count?: number | null
          donor_platinum_count?: number | null
          donor_silver_count?: number | null
          households?: number | null
          id?: string
          margin_pct?: number | null
          margin_votes?: number | null
          muslim_registered?: number | null
          muslim_unregistered?: number | null
          muslim_voters?: number
          political_activists?: number | null
          political_donors?: number | null
          primary_2022?: number | null
          primary_2022_pct?: number | null
          primary_2024?: number | null
          primary_2024_pct?: number | null
          registration_pct?: number | null
          runner_up?: string | null
          runner_up_party?: string | null
          runner_up_votes?: number | null
          state_code: string
          total_votes?: number | null
          turnout_2022_pct?: number | null
          turnout_pct?: number | null
          voted_2022?: number | null
          voted_2024?: number | null
          votes_needed?: number | null
          winner?: string | null
          winner_party?: string | null
          winner_votes?: number | null
        }
        Update: {
          actual_turnout_pct?: number | null
          can_impact?: boolean | null
          cd_code?: string
          cell_phones?: number | null
          cost_estimate?: number | null
          didnt_vote_2024?: number | null
          district_num?: number
          donor_gold_count?: number | null
          donor_platinum_count?: number | null
          donor_silver_count?: number | null
          households?: number | null
          id?: string
          margin_pct?: number | null
          margin_votes?: number | null
          muslim_registered?: number | null
          muslim_unregistered?: number | null
          muslim_voters?: number
          political_activists?: number | null
          political_donors?: number | null
          primary_2022?: number | null
          primary_2022_pct?: number | null
          primary_2024?: number | null
          primary_2024_pct?: number | null
          registration_pct?: number | null
          runner_up?: string | null
          runner_up_party?: string | null
          runner_up_votes?: number | null
          state_code?: string
          total_votes?: number | null
          turnout_2022_pct?: number | null
          turnout_pct?: number | null
          voted_2022?: number | null
          voted_2024?: number | null
          votes_needed?: number | null
          winner?: string | null
          winner_party?: string | null
          winner_votes?: number | null
        }
        Relationships: []
      }
      voter_impact_states: {
        Row: {
          cell_phones: number | null
          donor_gold_count: number | null
          donor_platinum_count: number | null
          donor_silver_count: number | null
          households: number | null
          id: string
          muslim_voters: number
          political_activists: number | null
          political_donors: number | null
          primary_2022: number | null
          primary_2022_pct: number | null
          primary_2024: number | null
          primary_2024_pct: number | null
          registered: number | null
          registered_pct: number | null
          state_code: string
          state_name: string
          vote_2022: number | null
          vote_2022_pct: number | null
          vote_2024: number | null
          vote_2024_pct: number | null
        }
        Insert: {
          cell_phones?: number | null
          donor_gold_count?: number | null
          donor_platinum_count?: number | null
          donor_silver_count?: number | null
          households?: number | null
          id?: string
          muslim_voters?: number
          political_activists?: number | null
          political_donors?: number | null
          primary_2022?: number | null
          primary_2022_pct?: number | null
          primary_2024?: number | null
          primary_2024_pct?: number | null
          registered?: number | null
          registered_pct?: number | null
          state_code: string
          state_name: string
          vote_2022?: number | null
          vote_2022_pct?: number | null
          vote_2024?: number | null
          vote_2024_pct?: number | null
        }
        Update: {
          cell_phones?: number | null
          donor_gold_count?: number | null
          donor_platinum_count?: number | null
          donor_silver_count?: number | null
          households?: number | null
          id?: string
          muslim_voters?: number
          political_activists?: number | null
          political_donors?: number | null
          primary_2022?: number | null
          primary_2022_pct?: number | null
          primary_2024?: number | null
          primary_2024_pct?: number | null
          registered?: number | null
          registered_pct?: number | null
          state_code?: string
          state_name?: string
          vote_2022?: number | null
          vote_2022_pct?: number | null
          vote_2024?: number | null
          vote_2024_pct?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      can_access_organization_data: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      check_application_status: {
        Args: { check_token: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          reviewed_at: string
          reviewer_notes: string
          status: string
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_email_suppressed: { Args: never; Returns: boolean }
      is_invited: { Args: { check_email: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      self_delete_account: { Args: never; Returns: undefined }
      toggle_email_suppression: {
        Args: { suppress: boolean }
        Returns: undefined
      }
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
