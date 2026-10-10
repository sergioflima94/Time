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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_comments: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          player_id: string
          text: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          player_id: string
          text: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          player_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_comments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_likes: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          player_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          player_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_likes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      assisted_venues: {
        Row: {
          created_at: string
          establishment_id: string
          prepared_by: string
          revision: number
          status: string
          target_player_id: string | null
        }
        Insert: {
          created_at?: string
          establishment_id: string
          prepared_by: string
          revision?: number
          status?: string
          target_player_id?: string | null
        }
        Update: {
          created_at?: string
          establishment_id?: string
          prepared_by?: string
          revision?: number
          status?: string
          target_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assisted_venues_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assisted_venues_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          checked_in: boolean
          confirmed_order: number | null
          game_id: string
          id: string
          no_show: boolean
          player_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          checked_in?: boolean
          confirmed_order?: number | null
          game_id: string
          id?: string
          no_show?: boolean
          player_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          checked_in?: boolean
          confirmed_order?: number | null
          game_id?: string
          id?: string
          no_show?: boolean
          player_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_player_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          summary: string
        }
        Insert: {
          action: string
          actor_player_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          summary: string
        }
        Update: {
          action?: string
          actor_player_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      banter_votes: {
        Row: {
          badge: string
          created_at: string
          expires_at: string
          game_id: string
          id: string
          pelada_id: string
          target_player_id: string
          voter_player_id: string
        }
        Insert: {
          badge: string
          created_at?: string
          expires_at?: string
          game_id: string
          id?: string
          pelada_id: string
          target_player_id: string
          voter_player_id: string
        }
        Update: {
          badge?: string
          created_at?: string
          expires_at?: string
          game_id?: string
          id?: string
          pelada_id?: string
          target_player_id?: string
          voter_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banter_votes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banter_votes_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banter_votes_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banter_votes_voter_player_id_fkey"
            columns: ["voter_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_deposits: {
        Row: {
          amount_cents: number
          booking_request_id: string
          checkout_url: string | null
          created_at: string
          due_at: string
          external_id: string | null
          id: string
          method: string
          paid_at: string | null
          payer_player_id: string
          pix_copy_paste: string | null
          provider: string
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          booking_request_id: string
          checkout_url?: string | null
          created_at?: string
          due_at: string
          external_id?: string | null
          id?: string
          method: string
          paid_at?: string | null
          payer_player_id: string
          pix_copy_paste?: string | null
          provider: string
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          booking_request_id?: string
          checkout_url?: string | null
          created_at?: string
          due_at?: string
          external_id?: string | null
          id?: string
          method?: string
          paid_at?: string | null
          payer_player_id?: string
          pix_copy_paste?: string | null
          provider?: string
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_deposits_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: true
            referencedRelation: "game_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_deposits_payer_player_id_fkey"
            columns: ["payer_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      buddy_invites: {
        Row: {
          buddy_player_id: string | null
          code: string
          created_at: string
          expires_at: string
          game_id: string
          host_player_id: string
          id: string
          status: string
        }
        Insert: {
          buddy_player_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          game_id: string
          host_player_id: string
          id?: string
          status?: string
        }
        Update: {
          buddy_player_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          game_id?: string
          host_player_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_invites_buddy_player_id_fkey"
            columns: ["buddy_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buddy_invites_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buddy_invites_host_player_id_fkey"
            columns: ["host_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_shifts: {
        Row: {
          closed_at: string | null
          closing_amount: number | null
          difference: number | null
          establishment_id: string
          expected_amount: number | null
          id: string
          opened_at: string
          opened_by_player_id: string
          opening_amount: number
          status: string
        }
        Insert: {
          closed_at?: string | null
          closing_amount?: number | null
          difference?: number | null
          establishment_id: string
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by_player_id: string
          opening_amount?: number
          status?: string
        }
        Update: {
          closed_at?: string | null
          closing_amount?: number | null
          difference?: number | null
          establishment_id?: string
          expected_amount?: number | null
          id?: string
          opened_at?: string
          opened_by_player_id?: string
          opening_amount?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_shifts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_shifts_opened_by_player_id_fkey"
            columns: ["opened_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_budgets: {
        Row: {
          assistant_referee_cost_per_match: number
          championship_id: string
          cleaning_cost: number
          contingency_percent: number
          field_cost_per_match: number
          food_water_cost: number
          id: string
          licenses_cost: number
          marketing_cost: number
          materials_cost: number
          medical_cost: number
          other_cost: number
          payment_fee_percent: number
          planned_teams: number
          prize_cost: number
          referee_cost_per_match: number
          security_cost: number
          table_staff_cost_per_match: number
          target_profit: number
          trophies_cost: number
          updated_at: string
        }
        Insert: {
          assistant_referee_cost_per_match?: number
          championship_id: string
          cleaning_cost?: number
          contingency_percent?: number
          field_cost_per_match?: number
          food_water_cost?: number
          id?: string
          licenses_cost?: number
          marketing_cost?: number
          materials_cost?: number
          medical_cost?: number
          other_cost?: number
          payment_fee_percent?: number
          planned_teams: number
          prize_cost?: number
          referee_cost_per_match?: number
          security_cost?: number
          table_staff_cost_per_match?: number
          target_profit?: number
          trophies_cost?: number
          updated_at?: string
        }
        Update: {
          assistant_referee_cost_per_match?: number
          championship_id?: string
          cleaning_cost?: number
          contingency_percent?: number
          field_cost_per_match?: number
          food_water_cost?: number
          id?: string
          licenses_cost?: number
          marketing_cost?: number
          materials_cost?: number
          medical_cost?: number
          other_cost?: number
          payment_fee_percent?: number
          planned_teams?: number
          prize_cost?: number
          referee_cost_per_match?: number
          security_cost?: number
          table_staff_cost_per_match?: number
          target_profit?: number
          trophies_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_budgets_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: true
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_goals: {
        Row: {
          id: string
          match_id: string
          scored_at: string
          scorer_player_id: string | null
          team_id: string
        }
        Insert: {
          id?: string
          match_id: string
          scored_at?: string
          scorer_player_id?: string | null
          team_id: string
        }
        Update: {
          id?: string
          match_id?: string
          scored_at?: string
          scorer_player_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_goals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "championship_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_goals_scorer_player_id_fkey"
            columns: ["scorer_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "championship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_matches: {
        Row: {
          championship_id: string
          ended_at: string | null
          feeds_from_match_a_id: string | null
          feeds_from_match_b_id: string | null
          field_id: string | null
          id: string
          penalty_score_a: number | null
          penalty_score_b: number | null
          round: number
          round_label: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          team_a_id: string | null
          team_b_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          championship_id: string
          ended_at?: string | null
          feeds_from_match_a_id?: string | null
          feeds_from_match_b_id?: string | null
          field_id?: string | null
          id?: string
          penalty_score_a?: number | null
          penalty_score_b?: number | null
          round: number
          round_label: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          championship_id?: string
          ended_at?: string | null
          feeds_from_match_a_id?: string | null
          feeds_from_match_b_id?: string | null
          field_id?: string | null
          id?: string
          penalty_score_a?: number | null
          penalty_score_b?: number | null
          round?: number
          round_label?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          team_a_id?: string | null
          team_b_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "championship_matches_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_matches_feeds_from_match_a_id_fkey"
            columns: ["feeds_from_match_a_id"]
            isOneToOne: false
            referencedRelation: "championship_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_matches_feeds_from_match_b_id_fkey"
            columns: ["feeds_from_match_b_id"]
            isOneToOne: false
            referencedRelation: "championship_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_matches_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "championship_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "championship_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "championship_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_team_players: {
        Row: {
          championship_team_id: string
          is_goalkeeper: boolean
          player_id: string
        }
        Insert: {
          championship_team_id: string
          is_goalkeeper?: boolean
          player_id: string
        }
        Update: {
          championship_team_id?: string
          is_goalkeeper?: boolean
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_team_players_championship_team_id_fkey"
            columns: ["championship_team_id"]
            isOneToOne: false
            referencedRelation: "championship_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      championship_teams: {
        Row: {
          championship_id: string
          color: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          pelada_id: string | null
          registered_by_player_id: string
          status: string
        }
        Insert: {
          championship_id: string
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          pelada_id?: string | null
          registered_by_player_id: string
          status?: string
        }
        Update: {
          championship_id?: string
          color?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          pelada_id?: string | null
          registered_by_player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "championship_teams_championship_id_fkey"
            columns: ["championship_id"]
            isOneToOne: false
            referencedRelation: "championships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_teams_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championship_teams_registered_by_player_id_fkey"
            columns: ["registered_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      championships: {
        Row: {
          created_at: string
          created_by: string
          entry_fee: number | null
          establishment_id: string | null
          field_id: string | null
          format: string
          id: string
          match_minutes: number
          max_teams: number | null
          name: string
          organizer_pelada_id: string | null
          registration_code: string
          registration_deadline: string | null
          sport_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entry_fee?: number | null
          establishment_id?: string | null
          field_id?: string | null
          format: string
          id?: string
          match_minutes?: number
          max_teams?: number | null
          name: string
          organizer_pelada_id?: string | null
          registration_code: string
          registration_deadline?: string | null
          sport_id?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entry_fee?: number | null
          establishment_id?: string | null
          field_id?: string | null
          format?: string
          id?: string
          match_minutes?: number
          max_teams?: number | null
          name?: string
          organizer_pelada_id?: string | null
          registration_code?: string
          registration_deadline?: string | null
          sport_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "championships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championships_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championships_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "championships_organizer_pelada_id_fkey"
            columns: ["organizer_pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          admin_only_posting: boolean
          context_id: string
          context_type: string
          created_at: string
          created_by: string
          id: string
          title: string
        }
        Insert: {
          admin_only_posting?: boolean
          context_id: string
          context_type: string
          created_at?: string
          created_by: string
          id?: string
          title: string
        }
        Update: {
          admin_only_posting?: boolean
          context_id?: string
          context_type?: string
          created_at?: string
          created_by?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          sender_player_id: string
          system: boolean
          text: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          sender_player_id: string
          system?: boolean
          text: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          sender_player_id?: string
          system?: boolean
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_player_id_fkey"
            columns: ["sender_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          channel_id: string
          last_read_at: string | null
          player_id: string
          role: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string | null
          player_id: string
          role?: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string | null
          player_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      class_attendances: {
        Row: {
          coach_notes: string | null
          id: string
          player_id: string
          recorded_at: string
          session_id: string
          status: string
        }
        Insert: {
          coach_notes?: string | null
          id?: string
          player_id: string
          recorded_at?: string
          session_id: string
          status: string
        }
        Update: {
          coach_notes?: string | null
          id?: string
          player_id?: string
          recorded_at?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_attendances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_attendances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          amount: number
          enrolled_at: string
          id: string
          is_trial: boolean
          paid_at: string | null
          payment_method: string | null
          payment_status: string
          player_id: string
          session_id: string
          status: string
          waitlist_position: number | null
        }
        Insert: {
          amount?: number
          enrolled_at?: string
          id?: string
          is_trial?: boolean
          paid_at?: string | null
          payment_method?: string | null
          payment_status: string
          player_id: string
          session_id: string
          status: string
          waitlist_position?: number | null
        }
        Update: {
          amount?: number
          enrolled_at?: string
          id?: string
          is_trial?: boolean
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string
          player_id?: string
          session_id?: string
          status?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_programs: {
        Row: {
          active: boolean
          billing_type: string
          capacity: number
          coach_id: string
          created_at: string
          duration_minutes: number
          establishment_id: string
          field_id: string
          format: string
          id: string
          level: string
          name: string
          price: number
          sport_id: string
        }
        Insert: {
          active?: boolean
          billing_type: string
          capacity: number
          coach_id: string
          created_at?: string
          duration_minutes: number
          establishment_id: string
          field_id: string
          format: string
          id?: string
          level: string
          name: string
          price: number
          sport_id: string
        }
        Update: {
          active?: boolean
          billing_type?: string
          capacity?: number
          coach_id?: string
          created_at?: string
          duration_minutes?: number
          establishment_id?: string
          field_id?: string
          format?: string
          id?: string
          level?: string
          name?: string
          price?: number
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_programs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_programs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_programs_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          cancellation_reason: string | null
          ends_at: string
          id: string
          program_id: string
          starts_at: string
          status: string
        }
        Insert: {
          cancellation_reason?: string | null
          ends_at: string
          id?: string
          program_id: string
          starts_at: string
          status?: string
        }
        Update: {
          cancellation_reason?: string | null
          ends_at?: string
          id?: string
          program_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "class_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_mutations: {
        Row: {
          aggregate: string
          aggregate_id: string
          auth_user_id: string
          client_created_at: string
          id: string
          operation: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          aggregate: string
          aggregate_id: string
          auth_user_id?: string
          client_created_at: string
          id: string
          operation: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          aggregate?: string
          aggregate_id?: string
          auth_user_id?: string
          client_created_at?: string
          id?: string
          operation?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
      coaches: {
        Row: {
          active: boolean
          bio: string | null
          establishment_id: string
          id: string
          player_id: string
          sport_ids: string[]
        }
        Insert: {
          active?: boolean
          bio?: string | null
          establishment_id: string
          id?: string
          player_id: string
          sport_ids?: string[]
        }
        Update: {
          active?: boolean
          bio?: string | null
          establishment_id?: string
          id?: string
          player_id?: string
          sport_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "coaches_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaches_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      commerce_listings: {
        Row: {
          active: boolean
          category: string
          establishment_id: string
          id: string
          kind: string
          name: string
          price: number
          stock: number
        }
        Insert: {
          active?: boolean
          category: string
          establishment_id: string
          id?: string
          kind: string
          name: string
          price: number
          stock?: number
        }
        Update: {
          active?: boolean
          category?: string
          establishment_id?: string
          id?: string
          kind?: string
          name?: string
          price?: number
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "commerce_listings_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_checkout_orders: {
        Row: {
          agreement_id: string
          amount: number
          building: boolean
          checkout_url: string | null
          created_at: string
          cycle: number
          expires_at: string
          id: string
          period_end: string | null
          preference_id: string | null
          provider_payment_id: string | null
          provider_updated_at: string | null
          status: string
          terms_accepted_by: string
          terms_version: string
        }
        Insert: {
          agreement_id: string
          amount: number
          building?: boolean
          checkout_url?: string | null
          created_at?: string
          cycle: number
          expires_at?: string
          id?: string
          period_end?: string | null
          preference_id?: string | null
          provider_payment_id?: string | null
          provider_updated_at?: string | null
          status?: string
          terms_accepted_by: string
          terms_version: string
        }
        Update: {
          agreement_id?: string
          amount?: number
          building?: boolean
          checkout_url?: string | null
          created_at?: string
          cycle?: number
          expires_at?: string
          id?: string
          period_end?: string | null
          preference_id?: string | null
          provider_payment_id?: string | null
          provider_updated_at?: string | null
          status?: string
          terms_accepted_by?: string
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_checkout_orders_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "platform_commercial_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_plans: {
        Row: {
          active: boolean
          audience: string
          benefits: Json
          highlighted: boolean
          id: string
          monthly_price: number
          name: string
        }
        Insert: {
          active?: boolean
          audience: string
          benefits?: Json
          highlighted?: boolean
          id?: string
          monthly_price: number
          name: string
        }
        Update: {
          active?: boolean
          audience?: string
          benefits?: Json
          highlighted?: boolean
          id?: string
          monthly_price?: number
          name?: string
        }
        Relationships: []
      }
      commercial_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          establishment_id: string | null
          id: string
          pelada_id: string | null
          plan_id: string
          provider: string | null
          provider_subscription_id: string | null
          status: string
          subscriber_player_id: string | null
        }
        Insert: {
          created_at?: string
          current_period_end: string
          establishment_id?: string | null
          id?: string
          pelada_id?: string | null
          plan_id: string
          provider?: string | null
          provider_subscription_id?: string | null
          status: string
          subscriber_player_id?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string
          establishment_id?: string | null
          id?: string
          pelada_id?: string | null
          plan_id?: string
          provider?: string | null
          provider_subscription_id?: string | null
          status?: string
          subscriber_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_subscriptions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_subscriptions_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_subscriptions_subscriber_player_id_fkey"
            columns: ["subscriber_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          active: boolean
          expo_push_token: string
          id: string
          platform: string
          player_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          expo_push_token: string
          id?: string
          platform: string
          player_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          expo_push_token?: string
          id?: string
          platform?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_waivers: {
        Row: {
          body: string
          created_by: string
          id: string
          required: boolean
          scope: string
          scope_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_by: string
          id?: string
          required?: boolean
          scope: string
          scope_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_by?: string
          id?: string
          required?: boolean
          scope?: string
          scope_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "digital_waivers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_staff: {
        Row: {
          active: boolean
          created_at: string
          establishment_id: string
          id: string
          player_id: string
          roles: string[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          establishment_id: string
          id?: string
          player_id: string
          roles?: string[]
        }
        Update: {
          active?: boolean
          created_at?: string
          establishment_id?: string
          id?: string
          player_id?: string
          roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "establishment_staff_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_staff_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          access_code: string
          cancellation_refund_hours: number
          cancellation_refund_percent: number
          created_at: string
          id: string
          messaging_provider: string
          name: string
          owner_player_id: string
          payout_method: string
          pix_key: string | null
          reservation_deposit_percent: number
          whatsapp_opt_in: boolean
          whatsapp_phone: string | null
        }
        Insert: {
          access_code: string
          cancellation_refund_hours?: number
          cancellation_refund_percent?: number
          created_at?: string
          id?: string
          messaging_provider?: string
          name: string
          owner_player_id: string
          payout_method?: string
          pix_key?: string | null
          reservation_deposit_percent?: number
          whatsapp_opt_in?: boolean
          whatsapp_phone?: string | null
        }
        Update: {
          access_code?: string
          cancellation_refund_hours?: number
          cancellation_refund_percent?: number
          created_at?: string
          id?: string
          messaging_provider?: string
          name?: string
          owner_player_id?: string
          payout_method?: string
          pix_key?: string | null
          reservation_deposit_percent?: number
          whatsapp_opt_in?: boolean
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishments_owner_player_id_fkey"
            columns: ["owner_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      field_availabilities: {
        Row: {
          active: boolean
          day_of_week: number
          end_time: string
          field_id: string
          id: string
          price: number | null
          slot_minutes: number
          start_time: string
        }
        Insert: {
          active?: boolean
          day_of_week: number
          end_time: string
          field_id: string
          id?: string
          price?: number | null
          slot_minutes?: number
          start_time: string
        }
        Update: {
          active?: boolean
          day_of_week?: number
          end_time?: string
          field_id?: string
          id?: string
          price?: number | null
          slot_minutes?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_availabilities_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      field_bookings: {
        Row: {
          created_at: string
          created_by: string
          date: string | null
          day_of_week: number | null
          duration_minutes: number
          establishment_id: string
          field_id: string
          id: string
          notes: string | null
          pelada_id: string | null
          recurrence: string
          team_name: string
          time: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date?: string | null
          day_of_week?: number | null
          duration_minutes?: number
          establishment_id: string
          field_id: string
          id?: string
          notes?: string | null
          pelada_id?: string | null
          recurrence: string
          team_name: string
          time: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string | null
          day_of_week?: number | null
          duration_minutes?: number
          establishment_id?: string
          field_id?: string
          id?: string
          notes?: string | null
          pelada_id?: string | null
          recurrence?: string
          team_name?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_bookings_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_bookings_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_bookings_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      field_directory_entries: {
        Row: {
          active: boolean
          address: string
          created_by: string
          field_id: string | null
          id: string
          latitude: number
          longitude: number
          name: string
          online_requested: boolean
          phone: string
          revision: number
          sport_id: string
          updated_at: string
          whatsapp: boolean
        }
        Insert: {
          active?: boolean
          address: string
          created_by: string
          field_id?: string | null
          id?: string
          latitude: number
          longitude: number
          name: string
          online_requested?: boolean
          phone: string
          revision?: number
          sport_id: string
          updated_at?: string
          whatsapp?: boolean
        }
        Update: {
          active?: boolean
          address?: string
          created_by?: string
          field_id?: string | null
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          online_requested?: boolean
          phone?: string
          revision?: number
          sport_id?: string
          updated_at?: string
          whatsapp?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "field_directory_entries_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: true
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_directory_entries_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sport_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      field_promotions: {
        Row: {
          active: boolean
          campaign_budget: number | null
          ends_at: string | null
          field_id: string
          id: string
          label: string
          price_per_confirmed_booking: number
          sport_id: string
          starts_at: string
        }
        Insert: {
          active?: boolean
          campaign_budget?: number | null
          ends_at?: string | null
          field_id: string
          id?: string
          label: string
          price_per_confirmed_booking?: number
          sport_id: string
          starts_at?: string
        }
        Update: {
          active?: boolean
          campaign_budget?: number | null
          ends_at?: string | null
          field_id?: string
          id?: string
          label?: string
          price_per_confirmed_booking?: number
          sport_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_promotions_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      fields: {
        Row: {
          address: string | null
          average_rating: number | null
          cancellation_rate: number
          created_by: string
          establishment_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          pelada_id: string | null
          sport_id: string
        }
        Insert: {
          address?: string | null
          average_rating?: number | null
          cancellation_rate?: number
          created_by: string
          establishment_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          pelada_id?: string | null
          sport_id?: string
        }
        Update: {
          address?: string | null
          average_rating?: number | null
          cancellation_rate?: number
          created_by?: string
          establishment_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          pelada_id?: string | null
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fields_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fields_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      free_agent_invites: {
        Row: {
          created_at: string
          game_id: string
          id: string
          invited_by_player_id: string
          pelada_id: string
          player_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          invited_by_player_id: string
          pelada_id: string
          player_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          invited_by_player_id?: string
          pelada_id?: string
          player_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "free_agent_invites_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_invites_invited_by_player_id_fkey"
            columns: ["invited_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_invites_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_agent_invites_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      friendly_match_goals: {
        Row: {
          id: string
          match_id: string
          pelada_id: string
          scored_at: string
          scorer_player_id: string | null
        }
        Insert: {
          id?: string
          match_id: string
          pelada_id: string
          scored_at?: string
          scorer_player_id?: string | null
        }
        Update: {
          id?: string
          match_id?: string
          pelada_id?: string
          scored_at?: string
          scorer_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendly_match_goals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "friendly_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendly_match_goals_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendly_match_goals_scorer_player_id_fkey"
            columns: ["scorer_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      friendly_matches: {
        Row: {
          challenge_id: string
          ended_at: string | null
          field_id: string | null
          id: string
          match_minutes: number
          pelada_a_id: string
          pelada_b_id: string
          scheduled_at: string
          sport_id: string
          started_at: string | null
          status: string
          winner_pelada_id: string | null
        }
        Insert: {
          challenge_id: string
          ended_at?: string | null
          field_id?: string | null
          id?: string
          match_minutes?: number
          pelada_a_id: string
          pelada_b_id: string
          scheduled_at: string
          sport_id?: string
          started_at?: string | null
          status?: string
          winner_pelada_id?: string | null
        }
        Update: {
          challenge_id?: string
          ended_at?: string | null
          field_id?: string | null
          id?: string
          match_minutes?: number
          pelada_a_id?: string
          pelada_b_id?: string
          scheduled_at?: string
          sport_id?: string
          started_at?: string | null
          status?: string
          winner_pelada_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friendly_matches_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "team_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendly_matches_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendly_matches_pelada_a_id_fkey"
            columns: ["pelada_a_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendly_matches_pelada_b_id_fkey"
            columns: ["pelada_b_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendly_matches_winner_pelada_id_fkey"
            columns: ["winner_pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_campaigns: {
        Row: {
          allow_anonymous: boolean
          category: string
          closed_at: string | null
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          id: string
          image_url: string | null
          payout_player_id: string
          pelada_id: string
          status: string
          suggested_amount: number | null
          target_amount: number
          title: string
        }
        Insert: {
          allow_anonymous?: boolean
          category: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          payout_player_id: string
          pelada_id: string
          status?: string
          suggested_amount?: number | null
          target_amount: number
          title: string
        }
        Update: {
          allow_anonymous?: boolean
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          payout_player_id?: string
          pelada_id?: string
          status?: string
          suggested_amount?: number | null
          target_amount?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_campaigns_payout_player_id_fkey"
            columns: ["payout_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_campaigns_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_contributions: {
        Row: {
          amount: number
          anonymous: boolean
          campaign_id: string
          checkout_url: string | null
          created_at: string
          credited_player_id: string
          external_id: string | null
          id: string
          message: string | null
          method: string
          paid_at: string | null
          paid_by_player_id: string
          pix_copy_paste: string | null
          provider: string
          status: string
        }
        Insert: {
          amount: number
          anonymous?: boolean
          campaign_id: string
          checkout_url?: string | null
          created_at?: string
          credited_player_id: string
          external_id?: string | null
          id?: string
          message?: string | null
          method: string
          paid_at?: string | null
          paid_by_player_id: string
          pix_copy_paste?: string | null
          provider: string
          status?: string
        }
        Update: {
          amount?: number
          anonymous?: boolean
          campaign_id?: string
          checkout_url?: string | null
          created_at?: string
          credited_player_id?: string
          external_id?: string | null
          id?: string
          message?: string | null
          method?: string
          paid_at?: string | null
          paid_by_player_id?: string
          pix_copy_paste?: string | null
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fundraising_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_contributions_credited_player_id_fkey"
            columns: ["credited_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_contributions_paid_by_player_id_fkey"
            columns: ["paid_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_expenses: {
        Row: {
          amount: number
          campaign_id: string
          created_at: string
          id: string
          receipt_url: string | null
          recorded_by: string
          title: string
        }
        Insert: {
          amount: number
          campaign_id: string
          created_at?: string
          id?: string
          receipt_url?: string | null
          recorded_by: string
          title: string
        }
        Update: {
          amount?: number
          campaign_id?: string
          created_at?: string
          id?: string
          receipt_url?: string | null
          recorded_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "fundraising_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_booking_requests: {
        Row: {
          attempt: number
          code: string
          duration_minutes: number
          expires_at: string
          failure_reason: string | null
          field_id: string
          game_id: string
          id: string
          preference_id: string | null
          provider_message_id: string | null
          requested_at: string
          requested_start_at: string
          responded_at: string | null
          response_message_id: string | null
          schedule_id: string
          sent_at: string | null
          source: string
          status: string
        }
        Insert: {
          attempt?: number
          code: string
          duration_minutes: number
          expires_at: string
          failure_reason?: string | null
          field_id: string
          game_id: string
          id?: string
          preference_id?: string | null
          provider_message_id?: string | null
          requested_at?: string
          requested_start_at: string
          responded_at?: string | null
          response_message_id?: string | null
          schedule_id: string
          sent_at?: string | null
          source?: string
          status?: string
        }
        Update: {
          attempt?: number
          code?: string
          duration_minutes?: number
          expires_at?: string
          failure_reason?: string | null
          field_id?: string
          game_id?: string
          id?: string
          preference_id?: string | null
          provider_message_id?: string | null
          requested_at?: string
          requested_start_at?: string
          responded_at?: string | null
          response_message_id?: string | null
          schedule_id?: string
          sent_at?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_booking_requests_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_booking_requests_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_booking_requests_preference_id_fkey"
            columns: ["preference_id"]
            isOneToOne: false
            referencedRelation: "schedule_field_preferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_booking_requests_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      game_checkin_passes: {
        Row: {
          game_id: string
          id: string
          issued_at: string
          player_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          token_hash: string
        }
        Insert: {
          game_id: string
          id?: string
          issued_at?: string
          player_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          token_hash: string
        }
        Update: {
          game_id?: string
          id?: string
          issued_at?: string
          player_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_checkin_passes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_checkin_passes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_checkin_passes_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_highlight_votes: {
        Row: {
          game_id: string
          target_player_id: string
          voter_player_id: string
        }
        Insert: {
          game_id: string
          target_player_id: string
          voter_player_id: string
        }
        Update: {
          game_id?: string
          target_player_id?: string
          voter_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_highlight_votes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_highlight_votes_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_highlight_votes_voter_player_id_fkey"
            columns: ["voter_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_recap_consents: {
        Row: {
          game_id: string
          player_id: string
        }
        Insert: {
          game_id: string
          player_id: string
        }
        Update: {
          game_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_recap_consents_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_recap_consents_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_team_queue: {
        Row: {
          game_id: string
          position: number
          team_id: string
        }
        Insert: {
          game_id: string
          position: number
          team_id: string
        }
        Update: {
          game_id?: string
          position?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_team_queue_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_team_queue_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          created_by: string
          draw_method: string
          duration_minutes: number
          field_cost: number | null
          field_id: string
          id: string
          match_goal_limit: number | null
          match_minutes: number
          max_players: number
          pelada_id: string
          players_per_team: number
          rotation_mode: string
          schedule_id: string | null
          scheduled_at: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          draw_method?: string
          duration_minutes?: number
          field_cost?: number | null
          field_id: string
          id?: string
          match_goal_limit?: number | null
          match_minutes?: number
          max_players?: number
          pelada_id: string
          players_per_team?: number
          rotation_mode?: string
          schedule_id?: string | null
          scheduled_at: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          draw_method?: string
          duration_minutes?: number
          field_cost?: number | null
          field_id?: string
          id?: string
          match_goal_limit?: number | null
          match_minutes?: number
          max_players?: number
          pelada_id?: string
          players_per_team?: number
          rotation_mode?: string
          schedule_id?: string | null
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          game_id: string
          id: string
          match_turn_id: string
          scored_at: string
          scorer_player_id: string | null
          team_id: string
        }
        Insert: {
          game_id: string
          id?: string
          match_turn_id: string
          scored_at?: string
          scorer_player_id?: string | null
          team_id: string
        }
        Update: {
          game_id?: string
          id?: string
          match_turn_id?: string
          scored_at?: string
          scorer_player_id?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_match_turn_id_fkey"
            columns: ["match_turn_id"]
            isOneToOne: false
            referencedRelation: "match_turns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_scorer_player_id_fkey"
            columns: ["scorer_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_plans: {
        Row: {
          active: boolean
          benefits: Json
          bonus_credits: number
          credits: number
          establishment_id: string
          id: string
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          benefits?: Json
          bonus_credits?: number
          credits: number
          establishment_id: string
          id?: string
          name: string
          price: number
        }
        Update: {
          active?: boolean
          benefits?: Json
          bonus_credits?: number
          credits?: number
          establishment_id?: string
          id?: string
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_plans_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_subscriptions: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          player_id: string
          remaining_credits: number
          valid_until: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          player_id: string
          remaining_credits: number
          valid_until: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          player_id?: string
          remaining_credits?: number
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "loyalty_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_subscriptions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      makeup_credits: {
        Row: {
          expires_at: string
          id: string
          player_id: string
          program_id: string
          source_session_id: string
          used_at: string | null
        }
        Insert: {
          expires_at: string
          id?: string
          player_id: string
          program_id: string
          source_session_id: string
          used_at?: string | null
        }
        Update: {
          expires_at?: string
          id?: string
          player_id?: string
          program_id?: string
          source_session_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "makeup_credits_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "class_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_credits_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      match_turns: {
        Row: {
          duration_seconds: number
          ended_at: string | null
          game_id: string
          id: string
          roster_snapshot: Json | null
          started_at: string | null
          team_a_id: string
          team_b_id: string
          winner_team_id: string | null
        }
        Insert: {
          duration_seconds?: number
          ended_at?: string | null
          game_id: string
          id?: string
          roster_snapshot?: Json | null
          started_at?: string | null
          team_a_id: string
          team_b_id: string
          winner_team_id?: string | null
        }
        Update: {
          duration_seconds?: number
          ended_at?: string | null
          game_id?: string
          id?: string
          roster_snapshot?: Json | null
          started_at?: string | null
          team_a_id?: string
          team_b_id?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_turns_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_turns_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_turns_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_turns_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_player_id: string
          resolved_at: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_player_id: string
          resolved_at?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_player_id?: string
          resolved_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_reporter_player_id_fkey"
            columns: ["reporter_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      multi_sport_scoreboards: {
        Row: {
          away_name: string
          created_at: string
          created_by: string
          game_id: string | null
          home_name: string
          id: string
          max_segments: number | null
          period_minutes: number
          score_unit: string
          score_values: Json
          segments_to_win: number | null
          sport_id: string
          status: string
          target_points: number | null
          title: string
          win_by_two: boolean
        }
        Insert: {
          away_name: string
          created_at?: string
          created_by: string
          game_id?: string | null
          home_name: string
          id?: string
          max_segments?: number | null
          period_minutes?: number
          score_unit: string
          score_values?: Json
          segments_to_win?: number | null
          sport_id: string
          status?: string
          target_points?: number | null
          title: string
          win_by_two?: boolean
        }
        Update: {
          away_name?: string
          created_at?: string
          created_by?: string
          game_id?: string | null
          home_name?: string
          id?: string
          max_segments?: number | null
          period_minutes?: number
          score_unit?: string
          score_values?: Json
          segments_to_win?: number | null
          sport_id?: string
          status?: string
          target_points?: number | null
          title?: string
          win_by_two?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "multi_sport_scoreboards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multi_sport_scoreboards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_preferences: {
        Row: {
          completed: boolean
          persona: string
          player_id: string
          suggestions_enabled: boolean
          updated_at: string
        }
        Insert: {
          completed?: boolean
          persona: string
          player_id: string
          suggestions_enabled?: boolean
          updated_at?: string
        }
        Update: {
          completed?: boolean
          persona?: string
          player_id?: string
          suggestions_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      open_slot_offers: {
        Row: {
          duration_minutes: number
          establishment_id: string
          field_id: string
          id: string
          offer_price: number
          original_price: number
          sponsored: boolean
          sport_id: string
          starts_at: string
          status: string
        }
        Insert: {
          duration_minutes: number
          establishment_id: string
          field_id: string
          id?: string
          offer_price: number
          original_price: number
          sponsored?: boolean
          sport_id: string
          starts_at: string
          status?: string
        }
        Update: {
          duration_minutes?: number
          establishment_id?: string
          field_id?: string
          id?: string
          offer_price?: number
          original_price?: number
          sponsored?: boolean
          sport_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_slot_offers_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_slot_offers_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_requests: {
        Row: {
          booking_id: string | null
          commission_percent: number
          created_at: string
          id: string
          match_id: string | null
          opponent_accepted: boolean
          opponent_pelada_id: string | null
          pelada_id: string
          price: number
          slot_id: string
          status: string
        }
        Insert: {
          booking_id?: string | null
          commission_percent: number
          created_at?: string
          id?: string
          match_id?: string | null
          opponent_accepted?: boolean
          opponent_pelada_id?: string | null
          pelada_id: string
          price: number
          slot_id: string
          status?: string
        }
        Update: {
          booking_id?: string | null
          commission_percent?: number
          created_at?: string
          id?: string
          match_id?: string | null
          opponent_accepted?: boolean
          opponent_pelada_id?: string | null
          pelada_id?: string
          price?: number
          slot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "field_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "friendly_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_requests_opponent_pelada_id_fkey"
            columns: ["opponent_pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_requests_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_requests_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "opportunity_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_slots: {
        Row: {
          active: boolean
          created_at: string
          duration_minutes: number
          field_id: string
          id: string
          offer_price: number
          regular_price: number
          starts_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_minutes: number
          field_id: string
          id?: string
          offer_price: number
          regular_price: number
          starts_at: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_minutes?: number
          field_id?: string
          id?: string
          offer_price?: number
          regular_price?: number
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_slots_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_shares: {
        Row: {
          amount_cents: number
          id: string
          item_id: string
          participant_id: string
        }
        Insert: {
          amount_cents: number
          id?: string
          item_id: string
          participant_id: string
        }
        Update: {
          amount_cents?: number
          id?: string
          item_id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_shares_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "service_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_shares_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "tab_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_connections: {
        Row: {
          account_label: string | null
          card_enabled: boolean
          connected_at: string | null
          contactless_enabled: boolean
          credential_secret_id: string | null
          establishment_id: string
          id: string
          pix_enabled: boolean
          platform_fee_percent: number
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          card_enabled?: boolean
          connected_at?: string | null
          contactless_enabled?: boolean
          credential_secret_id?: string | null
          establishment_id: string
          id?: string
          pix_enabled?: boolean
          platform_fee_percent?: number
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          card_enabled?: boolean
          connected_at?: string | null
          contactless_enabled?: boolean
          credential_secret_id?: string | null
          establishment_id?: string
          id?: string
          pix_enabled?: boolean
          platform_fee_percent?: number
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_connections_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          created_at: string
          establishment_id: string
          gross_cents: number
          id: string
          net_cents: number
          platform_fee_cents: number
          provider_fee_cents: number
          settled_at: string | null
          source_id: string
          source_type: string
          status: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          gross_cents: number
          id?: string
          net_cents: number
          platform_fee_cents?: number
          provider_fee_cents?: number
          settled_at?: string | null
          source_id: string
          source_type: string
          status?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          gross_cents?: number
          id?: string
          net_cents?: number
          platform_fee_cents?: number
          provider_fee_cents?: number
          settled_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlements_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          game_id: string
          id: string
          method: string | null
          paid_at: string | null
          paid_by_player_id: string | null
          player_id: string
          status: string
        }
        Insert: {
          game_id: string
          id?: string
          method?: string | null
          paid_at?: string | null
          paid_by_player_id?: string | null
          player_id: string
          status?: string
        }
        Update: {
          game_id?: string
          id?: string
          method?: string | null
          paid_at?: string | null
          paid_by_player_id?: string | null
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_paid_by_player_id_fkey"
            columns: ["paid_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      pelada_memberships: {
        Row: {
          active: boolean
          joined_at: string
          pelada_id: string
          player_id: string
          role: string
        }
        Insert: {
          active?: boolean
          joined_at?: string
          pelada_id: string
          player_id: string
          role?: string
        }
        Update: {
          active?: boolean
          joined_at?: string
          pelada_id?: string
          player_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "pelada_memberships_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pelada_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      peladas: {
        Row: {
          created_at: string
          created_by: string
          default_match_minutes: number
          default_max_players: number
          description: string | null
          football_variant: string
          id: string
          invite_code: string
          member_can_invite_free_agents: boolean
          member_can_invite_new_members: boolean
          name: string
          sport: string
          sport_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_match_minutes?: number
          default_max_players?: number
          description?: string | null
          football_variant?: string
          id?: string
          invite_code: string
          member_can_invite_free_agents?: boolean
          member_can_invite_new_members?: boolean
          name: string
          sport?: string
          sport_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_match_minutes?: number
          default_max_players?: number
          description?: string | null
          football_variant?: string
          id?: string
          invite_code?: string
          member_can_invite_free_agents?: boolean
          member_can_invite_new_members?: boolean
          name?: string
          sport?: string
          sport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peladas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_account_controls: {
        Row: {
          player_id: string
          reason: string
          suspended: boolean
          updated_at: string
        }
        Insert: {
          player_id: string
          reason: string
          suspended?: boolean
          updated_at?: string
        }
        Update: {
          player_id?: string
          reason?: string
          suspended?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_account_controls_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_accounts: {
        Row: {
          active: boolean
          auth_user_id: string
          created_at: string
          role: string
        }
        Insert: {
          active?: boolean
          auth_user_id: string
          created_at?: string
          role: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string
          created_at?: string
          role?: string
        }
        Relationships: []
      }
      platform_admin_audit: {
        Row: {
          action: string
          actor_auth_user_id: string | null
          after_value: Json | null
          before_value: Json | null
          created_at: string
          id: string
          reason: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_auth_user_id?: string | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          reason: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_auth_user_id?: string | null
          after_value?: Json | null
          before_value?: Json | null
          created_at?: string
          id?: string
          reason?: string
          target_id?: string | null
        }
        Relationships: []
      }
      platform_commercial_agreements: {
        Row: {
          agreed_monthly_price: number
          audience: string
          created_at: string
          created_by: string
          discount_percent: number | null
          duration_months: number | null
          expires_at: string | null
          id: string
          kind: string
          list_monthly_price: number
          note: string
          plan_id: string
          request_id: string | null
          request_payload: Json | null
          responded_at: string | null
          responded_by: string | null
          revision: number
          revoked_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          agreed_monthly_price: number
          audience: string
          created_at?: string
          created_by: string
          discount_percent?: number | null
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          kind: string
          list_monthly_price: number
          note?: string
          plan_id: string
          request_id?: string | null
          request_payload?: Json | null
          responded_at?: string | null
          responded_by?: string | null
          revision?: number
          revoked_at?: string | null
          status: string
          target_id: string
        }
        Update: {
          agreed_monthly_price?: number
          audience?: string
          created_at?: string
          created_by?: string
          discount_percent?: number | null
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          kind?: string
          list_monthly_price?: number
          note?: string
          plan_id?: string
          request_id?: string | null
          request_payload?: Json | null
          responded_at?: string | null
          responded_by?: string | null
          revision?: number
          revoked_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_commercial_agreements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commercial_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_configuration: {
        Row: {
          id: boolean
          revision: number
          settings: Json
          updated_at: string
        }
        Insert: {
          id?: boolean
          revision?: number
          settings?: Json
          updated_at?: string
        }
        Update: {
          id?: boolean
          revision?: number
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      play_windows: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string
          id: string
          level: string
          pelada_id: string
          starts_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at: string
          id?: string
          level: string
          pelada_id: string
          starts_at: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          level?: string
          pelada_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_windows_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      player_duels: {
        Row: {
          challenged_id: string
          challenger_id: string
          created_at: string
          created_by: string
          id: string
          message: string | null
          responded_at: string | null
          result_note: string | null
          result_recorded_at: string | null
          status: string
          winner_id: string | null
        }
        Insert: {
          challenged_id: string
          challenger_id: string
          created_at?: string
          created_by: string
          id?: string
          message?: string | null
          responded_at?: string | null
          result_note?: string | null
          result_recorded_at?: string | null
          status?: string
          winner_id?: string | null
        }
        Update: {
          challenged_id?: string
          challenger_id?: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          result_note?: string | null
          result_recorded_at?: string | null
          status?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_duels_challenged_id_fkey"
            columns: ["challenged_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_duels_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_duels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_duels_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_fatigue: {
        Row: {
          created_at: string
          game_id: string
          id: string
          matches_remaining: number | null
          player_id: string
          status: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          matches_remaining?: number | null
          player_id: string
          status: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          matches_remaining?: number | null
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_fatigue_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_fatigue_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_preferences: {
        Row: {
          current_pelada_id: string | null
          notifications_seen_at: string | null
          player_id: string
          updated_at: string
        }
        Insert: {
          current_pelada_id?: string | null
          notifications_seen_at?: string | null
          player_id: string
          updated_at?: string
        }
        Update: {
          current_pelada_id?: string | null
          notifications_seen_at?: string | null
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_preferences_current_pelada_id_fkey"
            columns: ["current_pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_preferences_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          banter_opt_in: boolean
          card_background_url: string | null
          card_style_id: string | null
          created_at: string
          favorite_sports: string[]
          free_agent_availability: Json
          free_agent_opt_in: boolean
          free_agent_radius_km: number | null
          id: string
          is_guest: boolean
          location_lat: number | null
          location_lng: number | null
          location_updated_at: string | null
          name: string
          nickname: string | null
          phone: string | null
          preferred_position: string
          premium_auto_renew: boolean
          premium_since: string | null
          premium_until: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          banter_opt_in?: boolean
          card_background_url?: string | null
          card_style_id?: string | null
          created_at?: string
          favorite_sports?: string[]
          free_agent_availability?: Json
          free_agent_opt_in?: boolean
          free_agent_radius_km?: number | null
          id?: string
          is_guest?: boolean
          location_lat?: number | null
          location_lng?: number | null
          location_updated_at?: string | null
          name: string
          nickname?: string | null
          phone?: string | null
          preferred_position?: string
          premium_auto_renew?: boolean
          premium_since?: string | null
          premium_until?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          banter_opt_in?: boolean
          card_background_url?: string | null
          card_style_id?: string | null
          created_at?: string
          favorite_sports?: string[]
          free_agent_availability?: Json
          free_agent_opt_in?: boolean
          free_agent_radius_km?: number | null
          id?: string
          is_guest?: boolean
          location_lat?: number | null
          location_lng?: number | null
          location_updated_at?: string | null
          name?: string
          nickname?: string | null
          phone?: string | null
          preferred_position?: string
          premium_auto_renew?: boolean
          premium_since?: string | null
          premium_until?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          active: boolean
          establishment_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          establishment_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          establishment_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string
          description: string | null
          establishment_id: string
          id: string
          name: string
          price: number
          station: string
          stock_quantity: number | null
        }
        Insert: {
          active?: boolean
          category_id: string
          description?: string | null
          establishment_id: string
          id?: string
          name: string
          price: number
          station: string
          stock_quantity?: number | null
        }
        Update: {
          active?: boolean
          category_id?: string
          description?: string | null
          establishment_id?: string
          id?: string
          name?: string
          price?: number
          station?: string
          stock_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_game_join_requests: {
        Row: {
          created_at: string
          game_id: string
          id: string
          player_id: string
          status: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          player_id: string
          status?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_game_join_requests_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_game_join_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      public_game_listings: {
        Row: {
          description: string
          game_id: string
          level: string
          published: boolean
          updated_at: string
        }
        Insert: {
          description?: string
          game_id: string
          level?: string
          published?: boolean
          updated_at?: string
        }
        Update: {
          description?: string
          game_id?: string
          level?: string
          published?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_game_listings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      punishments: {
        Row: {
          created_at: string
          game_id: string
          id: string
          notes: string | null
          pelada_id: string
          player_id: string
          strike_level: number
          suspended_until_game_count: number
          type: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          notes?: string | null
          pelada_id: string
          player_id: string
          strike_level?: number
          suspended_until_game_count?: number
          type: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          notes?: string | null
          pelada_id?: string
          player_id?: string
          strike_level?: number
          suspended_until_game_count?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "punishments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punishments_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punishments_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          attack: number
          created_at: string
          defense: number
          game_id: string
          id: string
          overall: number | null
          pace: number
          rated_player_id: string
          rater_player_id: string
        }
        Insert: {
          attack: number
          created_at?: string
          defense: number
          game_id: string
          id?: string
          overall?: number | null
          pace: number
          rated_player_id: string
          rater_player_id: string
        }
        Update: {
          attack?: number
          created_at?: string
          defense?: number
          game_id?: string
          id?: string
          overall?: number | null
          pace?: number
          rated_player_id?: string
          rater_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rated_player_id_fkey"
            columns: ["rated_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_rater_player_id_fkey"
            columns: ["rater_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_campaigns: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          max_uses: number | null
          owner_player_id: string
          reward_credits: number
          uses: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          max_uses?: number | null
          owner_player_id: string
          reward_credits?: number
          uses?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          max_uses?: number | null
          owner_player_id?: string
          reward_credits?: number
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_campaigns_owner_player_id_fkey"
            columns: ["owner_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_redemptions: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          referred_player_id: string
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          referred_player_id: string
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          referred_player_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_redemptions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "referral_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_redemptions_referred_player_id_fkey"
            columns: ["referred_player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      reliability_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          game_id: string | null
          id: string
          kind: string
          note: string | null
          points: number
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          game_id?: string | null
          id?: string
          kind: string
          note?: string | null
          points: number
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          game_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "reliability_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_orders: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          pickup_at: string
          player_id: string
          quantity: number
          status: string
          total: number
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          pickup_at: string
          player_id: string
          quantity: number
          status?: string
          total: number
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          pickup_at?: string
          player_id?: string
          quantity?: number
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "commerce_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_orders_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payment_allocations: {
        Row: {
          amount_cents: number
          id: string
          item_share_id: string
          payment_id: string
        }
        Insert: {
          amount_cents: number
          id?: string
          item_share_id: string
          payment_id: string
        }
        Update: {
          amount_cents?: number
          id?: string
          item_share_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payment_allocations_item_share_id_fkey"
            columns: ["item_share_id"]
            isOneToOne: false
            referencedRelation: "order_item_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sale_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payment_intents: {
        Row: {
          amount_cents: number
          checkout_url: string | null
          covered_participant_ids: string[]
          created_at: string
          expires_at: string | null
          external_id: string | null
          id: string
          method: string
          paid_at: string | null
          payer_participant_id: string
          pix_copy_paste: string | null
          provider: string
          status: string
          tab_id: string
        }
        Insert: {
          amount_cents: number
          checkout_url?: string | null
          covered_participant_ids: string[]
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          id?: string
          method: string
          paid_at?: string | null
          payer_participant_id: string
          pix_copy_paste?: string | null
          provider: string
          status?: string
          tab_id: string
        }
        Update: {
          amount_cents?: number
          checkout_url?: string | null
          covered_participant_ids?: string[]
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          id?: string
          method?: string
          paid_at?: string | null
          payer_participant_id?: string
          pix_copy_paste?: string | null
          provider?: string
          status?: string
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payment_intents_payer_participant_id_fkey"
            columns: ["payer_participant_id"]
            isOneToOne: false
            referencedRelation: "tab_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payment_intents_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "service_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          id: string
          method: string
          paid_at: string
          payer_name: string
          payer_player_id: string | null
          reversed_at: string | null
          tab_id: string
        }
        Insert: {
          amount: number
          id?: string
          method: string
          paid_at?: string
          payer_name: string
          payer_player_id?: string | null
          reversed_at?: string | null
          tab_id: string
        }
        Update: {
          amount?: number
          id?: string
          method?: string
          paid_at?: string
          payer_name?: string
          payer_player_id?: string | null
          reversed_at?: string | null
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_payer_player_id_fkey"
            columns: ["payer_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "service_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_field_preferences: {
        Row: {
          created_at: string
          field_id: string
          id: string
          priority: number
          schedule_id: string
          source: string
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          priority: number
          schedule_id: string
          source?: string
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          priority?: number
          schedule_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_field_preferences_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_field_preferences_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          active: boolean
          auto_booking_enabled: boolean
          booking_duration_minutes: number
          booking_minimum_players: number
          booking_response_minutes: number
          created_by: string
          day_of_week: number | null
          default_field_cost: number | null
          draw_method: string
          end_date: string | null
          field_id: string
          id: string
          match_goal_limit: number | null
          match_minutes: number
          max_players: number
          pelada_id: string
          poll_quorum_percent: number
          poll_reminder_minutes: number
          recurrence: string
          start_date: string
          time: string
        }
        Insert: {
          active?: boolean
          auto_booking_enabled?: boolean
          booking_duration_minutes?: number
          booking_minimum_players?: number
          booking_response_minutes?: number
          created_by: string
          day_of_week?: number | null
          default_field_cost?: number | null
          draw_method?: string
          end_date?: string | null
          field_id: string
          id?: string
          match_goal_limit?: number | null
          match_minutes?: number
          max_players?: number
          pelada_id: string
          poll_quorum_percent?: number
          poll_reminder_minutes?: number
          recurrence: string
          start_date: string
          time: string
        }
        Update: {
          active?: boolean
          auto_booking_enabled?: boolean
          booking_duration_minutes?: number
          booking_minimum_players?: number
          booking_response_minutes?: number
          created_by?: string
          day_of_week?: number | null
          default_field_cost?: number | null
          draw_method?: string
          end_date?: string | null
          field_id?: string
          id?: string
          match_goal_limit?: number | null
          match_minutes?: number
          max_players?: number
          pelada_id?: string
          poll_quorum_percent?: number
          poll_reminder_minutes?: number
          recurrence?: string
          start_date?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      scoreboard_segments: {
        Row: {
          away_score: number
          finished: boolean
          home_score: number
          id: string
          label: string
          scoreboard_id: string
          sequence: number
        }
        Insert: {
          away_score?: number
          finished?: boolean
          home_score?: number
          id?: string
          label: string
          scoreboard_id: string
          sequence: number
        }
        Update: {
          away_score?: number
          finished?: boolean
          home_score?: number
          id?: string
          label?: string
          scoreboard_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "scoreboard_segments_scoreboard_id_fkey"
            columns: ["scoreboard_id"]
            isOneToOne: false
            referencedRelation: "multi_sport_scoreboards"
            referencedColumns: ["id"]
          },
        ]
      }
      season_standings: {
        Row: {
          assists: number
          draws: number
          fair_play: number
          games: number
          losses: number
          player_id: string
          points: number
          scored: number
          season_id: string
          wins: number
        }
        Insert: {
          assists?: number
          draws?: number
          fair_play?: number
          games?: number
          losses?: number
          player_id: string
          points?: number
          scored?: number
          season_id: string
          wins?: number
        }
        Update: {
          assists?: number
          draws?: number
          fair_play?: number
          games?: number
          losses?: number
          player_id?: string
          points?: number
          scored?: number
          season_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_standings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "sport_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_items: {
        Row: {
          cancellation_reason: string | null
          id: string
          notes: string | null
          order_id: string
          participant_id: string | null
          product_id: string
          quantity: number
          status: string
          unit_price: number
        }
        Insert: {
          cancellation_reason?: string | null
          id?: string
          notes?: string | null
          order_id: string
          participant_id?: string | null
          product_id: string
          quantity: number
          status?: string
          unit_price: number
        }
        Update: {
          cancellation_reason?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          participant_id?: string | null
          product_id?: string
          quantity?: number
          status?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "tab_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by_player_id: string
          id: string
          notes: string | null
          status: string
          submitted_at: string | null
          tab_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by_player_id: string
          id?: string
          notes?: string | null
          status?: string
          submitted_at?: string | null
          tab_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by_player_id?: string
          id?: string
          notes?: string | null
          status?: string
          submitted_at?: string | null
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_created_by_player_id_fkey"
            columns: ["created_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "service_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_tabs: {
        Row: {
          closed_at: string | null
          customer_name: string
          customer_player_id: string | null
          establishment_id: string
          game_id: string | null
          id: string
          label: string
          opened_at: string
          opened_by_player_id: string
          status: string
          table_label: string | null
        }
        Insert: {
          closed_at?: string | null
          customer_name: string
          customer_player_id?: string | null
          establishment_id: string
          game_id?: string | null
          id?: string
          label: string
          opened_at?: string
          opened_by_player_id: string
          status?: string
          table_label?: string | null
        }
        Update: {
          closed_at?: string | null
          customer_name?: string
          customer_player_id?: string | null
          establishment_id?: string
          game_id?: string | null
          id?: string
          label?: string
          opened_at?: string
          opened_by_player_id?: string
          status?: string
          table_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_tabs_customer_player_id_fkey"
            columns: ["customer_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_tabs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_tabs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_tabs_opened_by_player_id_fkey"
            columns: ["opened_by_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_catalog: {
        Row: {
          definition: Json
          id: string
          revision: number
          updated_at: string
        }
        Insert: {
          definition: Json
          id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          definition?: Json
          id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: []
      }
      sport_highlights: {
        Row: {
          created_at: string
          description: string
          game_id: string | null
          id: string
          kind: string
          player_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          game_id?: string | null
          id?: string
          kind: string
          player_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          game_id?: string | null
          id?: string
          kind?: string
          player_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_highlights_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sport_highlights_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      sport_seasons: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          name: string
          pelada_id: string
          points_draw: number
          points_participation: number
          points_win: number
          sport_id: string
          starts_at: string
          status: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          pelada_id: string
          points_draw?: number
          points_participation?: number
          points_win?: number
          sport_id: string
          starts_at: string
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          pelada_id?: string
          points_draw?: number
          points_participation?: number
          points_win?: number
          sport_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sport_seasons_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_staff: {
        Row: {
          available: boolean
          id: string
          name: string
          player_id: string | null
          price_per_event: number
          rating: number
          role: string
          sports: string[]
        }
        Insert: {
          available?: boolean
          id?: string
          name: string
          player_id?: string | null
          price_per_event: number
          rating?: number
          role: string
          sports?: string[]
        }
        Update: {
          available?: boolean
          id?: string
          name?: string
          player_id?: string | null
          price_per_event?: number
          rating?: number
          role?: string
          sports?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "sports_staff_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assignments: {
        Row: {
          amount: number
          establishment_id: string
          event_label: string
          id: string
          staff_id: string
          starts_at: string
          status: string
        }
        Insert: {
          amount: number
          establishment_id: string
          event_label: string
          id?: string
          staff_id: string
          starts_at: string
          status?: string
        }
        Update: {
          amount?: number
          establishment_id?: string
          event_label?: string
          id?: string
          staff_id?: string
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "sports_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_participants: {
        Row: {
          id: string
          name: string
          player_id: string | null
          tab_id: string
        }
        Insert: {
          id?: string
          name: string
          player_id?: string | null
          tab_id: string
        }
        Update: {
          id?: string
          name?: string
          player_id?: string | null
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_participants_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_participants_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "service_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      team_availability_poll_options: {
        Row: {
          field_id: string
          id: string
          label: string
          poll_id: string
          starts_at: string
        }
        Insert: {
          field_id: string
          id?: string
          label: string
          poll_id: string
          starts_at: string
        }
        Update: {
          field_id?: string
          id?: string
          label?: string
          poll_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_poll_options_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "team_availability_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      team_availability_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          player_id: string
          poll_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          player_id: string
          poll_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          player_id?: string
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "team_availability_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_poll_votes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "team_availability_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      team_availability_polls: {
        Row: {
          closes_at: string
          created_at: string
          created_by: string
          game_id: string
          id: string
          pelada_id: string
          question: string
          quorum_required: number
          reminder_sent_at: string | null
          selected_option_id: string | null
          status: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          created_by: string
          game_id: string
          id?: string
          pelada_id: string
          question: string
          quorum_required?: number
          reminder_sent_at?: string | null
          selected_option_id?: string | null
          status?: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          created_by?: string
          game_id?: string
          id?: string
          pelada_id?: string
          question?: string
          quorum_required?: number
          reminder_sent_at?: string | null
          selected_option_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_availability_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_polls_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_availability_polls_pelada_id_fkey"
            columns: ["pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_poll_selected_option_fk"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "team_availability_poll_options"
            referencedColumns: ["id"]
          },
        ]
      }
      team_challenges: {
        Row: {
          challenged_pelada_id: string
          challenger_pelada_id: string
          created_at: string
          created_by: string
          field_id: string | null
          id: string
          match_id: string | null
          message: string | null
          proposed_date: string
          proposed_time: string
          responded_at: string | null
          status: string
        }
        Insert: {
          challenged_pelada_id: string
          challenger_pelada_id: string
          created_at?: string
          created_by: string
          field_id?: string | null
          id?: string
          match_id?: string | null
          message?: string | null
          proposed_date: string
          proposed_time: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          challenged_pelada_id?: string
          challenger_pelada_id?: string
          created_at?: string
          created_by?: string
          field_id?: string | null
          id?: string
          match_id?: string | null
          message?: string | null
          proposed_date?: string
          proposed_time?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_challenges_challenged_pelada_id_fkey"
            columns: ["challenged_pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_challenges_challenger_pelada_id_fkey"
            columns: ["challenger_pelada_id"]
            isOneToOne: false
            referencedRelation: "peladas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_challenges_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_challenges_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "friendly_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      team_players: {
        Row: {
          is_goalkeeper: boolean
          player_id: string
          team_id: string
        }
        Insert: {
          is_goalkeeper?: boolean
          player_id: string
          team_id: string
        }
        Update: {
          is_goalkeeper?: boolean
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          game_id: string
          id: string
          name: string
          queue_order: number
        }
        Insert: {
          color?: string
          game_id: string
          id?: string
          name: string
          queue_order?: number
        }
        Update: {
          color?: string
          game_id?: string
          id?: string
          name?: string
          queue_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "teams_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_players: {
        Row: {
          game_id: string
          is_goalkeeper: boolean
          player_id: string
          rounds_waited: number
          tiebreak_rank: number
        }
        Insert: {
          game_id: string
          is_goalkeeper?: boolean
          player_id: string
          rounds_waited?: number
          tiebreak_rank?: number
        }
        Update: {
          game_id?: string
          is_goalkeeper?: boolean
          player_id?: string
          rounds_waited?: number
          tiebreak_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "waiting_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_acceptances: {
        Row: {
          accepted_at: string
          device_info: string | null
          player_id: string
          waiver_id: string
          waiver_version: number
        }
        Insert: {
          accepted_at?: string
          device_info?: string | null
          player_id: string
          waiver_id: string
          waiver_version: number
        }
        Update: {
          accepted_at?: string
          device_info?: string | null
          player_id?: string
          waiver_id?: string
          waiver_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "waiver_acceptances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiver_acceptances_waiver_id_fkey"
            columns: ["waiver_id"]
            isOneToOne: false
            referencedRelation: "digital_waivers"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount: number
          created_at: string
          description: string
          establishment_id: string | null
          external_reference: string | null
          id: string
          kind: string
          player_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          establishment_id?: string | null
          external_reference?: string | null
          id?: string
          kind: string
          player_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          establishment_id?: string | null
          external_reference?: string | null
          id?: string
          kind?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_deliveries: {
        Row: {
          booking_request_id: string | null
          created_at: string
          fallback_from_provider: string | null
          id: string
          kind: string
          phone: string | null
          poll_id: string | null
          preview: string
          provider: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
          to_player_id: string | null
          whatsapp_opt_in: boolean
        }
        Insert: {
          booking_request_id?: string | null
          created_at?: string
          fallback_from_provider?: string | null
          id?: string
          kind: string
          phone?: string | null
          poll_id?: string | null
          preview: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          to_player_id?: string | null
          whatsapp_opt_in?: boolean
        }
        Update: {
          booking_request_id?: string | null
          created_at?: string
          fallback_from_provider?: string | null
          id?: string
          kind?: string
          phone?: string | null
          poll_id?: string | null
          preview?: string
          provider?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          to_player_id?: string | null
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_deliveries_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "game_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_deliveries_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "team_availability_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_deliveries_to_player_id_fkey"
            columns: ["to_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      player_overalls: {
        Row: {
          attack: number | null
          defense: number | null
          overall: number | null
          pace: number | null
          player_id: string | null
          ratings_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_rated_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_operate_establishment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_receive_establishment_payment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      claim_commercial_preference: {
        Args: { p_order: string }
        Returns: boolean
      }
      commercial_access_snapshot: { Args: never; Returns: Json }
      commercial_admin_data: { Args: never; Returns: Json }
      commercial_agreement_json: {
        Args: {
          a: Database["public"]["Tables"]["platform_commercial_agreements"]["Row"]
        }
        Returns: Json
      }
      commercial_checkout_state: {
        Args: { p_agreement: string }
        Returns: Json
      }
      commercial_target_manager: {
        Args: { p_audience: string; p_target: string }
        Returns: boolean
      }
      commercial_target_member: {
        Args: { p_audience: string; p_target: string }
        Returns: boolean
      }
      directory_registered: { Args: { p_field: string }; Returns: boolean }
      fundraising_campaign_feed: {
        Args: { p_campaign_id: string }
        Returns: {
          amount: number
          anonymous: boolean
          credited_player_id: string
          id: string
          message: string
          paid_at: string
        }[]
      }
      game_recap: { Args: { p_game: string }; Returns: Json }
      get_gateway_credentials: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      growth_action: { Args: { p_action: string; p_data: Json }; Returns: Json }
      growth_slot_free: {
        Args: { p_field: string; p_minutes: number; p_start: string }
        Returns: boolean
      }
      growth_snapshot: { Args: never; Returns: Json }
      is_admin_of_pelada: { Args: { p_pelada_id: string }; Returns: boolean }
      is_chat_participant: { Args: { p_channel_id: string }; Returns: boolean }
      is_establishment_owner: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      is_member_of_pelada: { Args: { p_pelada_id: string }; Returns: boolean }
      is_owner_of_championship: {
        Args: { p_championship_id: string }
        Returns: boolean
      }
      issue_game_checkin_pass: {
        Args: { p_game_id: string; p_player_id: string; p_token: string }
        Returns: string
      }
      list_open_games: {
        Args: { p_query?: string; p_sport?: string }
        Returns: Json
      }
      manage_field_directory: { Args: never; Returns: Json }
      open_game_admin_data: { Args: { p_game_id: string }; Returns: Json }
      platform_account_allowed: { Args: never; Returns: boolean }
      platform_admin_role: { Args: never; Returns: string }
      platform_console_action: {
        Args: {
          p_action: string
          p_id: string
          p_payload: Json
          p_reason: string
        }
        Returns: undefined
      }
      platform_console_snapshot: { Args: { p_query?: string }; Returns: Json }
      player_banter_summary: {
        Args: { p_target_player_id: string }
        Returns: {
          badge: string
          vote_count: number
        }[]
      }
      prepare_commercial_checkout: {
        Args: { p_agreement: string; p_terms: string }
        Returns: Json
      }
      publish_open_game: {
        Args: {
          p_description: string
          p_game_id: string
          p_level: string
          p_published: boolean
        }
        Returns: undefined
      }
      redeem_game_checkin: {
        Args: {
          p_game_id: string
          p_player_id: string
          p_redeemed_by: string
          p_token: string
        }
        Returns: boolean
      }
      request_open_game: { Args: { p_game_id: string }; Returns: string }
      respond_commercial_agreement: {
        Args: { p_accept: boolean; p_id: string; p_revision: number }
        Returns: undefined
      }
      respond_game_booking_request: {
        Args: {
          p_accepted: boolean
          p_request_id: string
          p_response_message_id: string
        }
        Returns: string
      }
      respond_open_game_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: string
      }
      revoke_commercial_agreement: {
        Args: { p_id: string; p_reason: string; p_revision: number }
        Returns: undefined
      }
      save_commercial_agreement: {
        Args: { p_payload: Json; p_reason: string }
        Returns: string
      }
      save_commercial_agreement_internal: {
        Args: { p_payload: Json; p_reason: string }
        Returns: string
      }
      save_field_directory: {
        Args: {
          p_data: Json
          p_id: string
          p_reason: string
          p_revision: number
        }
        Returns: string
      }
      save_platform_sport: {
        Args: { p_definition: Json; p_reason: string; p_revision: number }
        Returns: undefined
      }
      search_field_directory: {
        Args: {
          p_lat?: number
          p_lng?: number
          p_offset?: number
          p_query?: string
          p_radius?: number
          p_sport?: string
        }
        Returns: Json
      }
      set_recap_consent: {
        Args: { p_allow: boolean; p_game: string }
        Returns: undefined
      }
      settle_commercial_checkout: {
        Args: {
          p_amount: number
          p_approved_at: string
          p_currency: string
          p_order: string
          p_payment: string
          p_status: string
          p_updated_at: string
        }
        Returns: undefined
      }
      settle_sale_payment_intent: {
        Args: { p_intent_id: string }
        Returns: string
      }
      vote_game_highlight: {
        Args: { p_game: string; p_player: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
