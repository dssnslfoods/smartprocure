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
      approval_logs: {
        Row: {
          action: string
          approved_by: string | null
          comment: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      award_approvals: {
        Row: {
          approval_comment: string | null
          approval_level: Database["public"]["Enums"]["approval_level_enum"]
          approval_status: Database["public"]["Enums"]["approval_decision_enum"]
          approved_at: string | null
          approver_id: string | null
          approver_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string | null
          id: string
          level_order: number
          quotation_id: string
          recommended_supplier_id: string
          required: boolean
          rfq_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          approval_comment?: string | null
          approval_level: Database["public"]["Enums"]["approval_level_enum"]
          approval_status?: Database["public"]["Enums"]["approval_decision_enum"]
          approved_at?: string | null
          approver_id?: string | null
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          id?: string
          level_order?: number
          quotation_id: string
          recommended_supplier_id: string
          required?: boolean
          rfq_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          approval_comment?: string | null
          approval_level?: Database["public"]["Enums"]["approval_level_enum"]
          approval_status?: Database["public"]["Enums"]["approval_decision_enum"]
          approved_at?: string | null
          approver_id?: string | null
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string | null
          id?: string
          level_order?: number
          quotation_id?: string
          recommended_supplier_id?: string
          required?: boolean
          rfq_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "award_approvals_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_approvals_recommended_supplier_id_fkey"
            columns: ["recommended_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_approvals_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "award_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          amount: number | null
          award_lifecycle_status:
            | Database["public"]["Enums"]["award_lifecycle_status_enum"]
            | null
          award_no: string | null
          award_reason: string | null
          awarded_at: string | null
          awarded_by: string | null
          created_at: string | null
          decision_reason: string | null
          final_amount: number | null
          final_quotation_id: string | null
          id: string
          is_override_selection: boolean
          ready_for_po: boolean | null
          recommendation: string | null
          rfq_id: string | null
          selection_reason: string | null
          selection_snapshot: Json | null
          status: Database["public"]["Enums"]["award_status"] | null
          supplier_id: string
          tenant_id: string
          updated_at: string | null
          winning_quotation_id: string | null
        }
        Insert: {
          amount?: number | null
          award_lifecycle_status?:
            | Database["public"]["Enums"]["award_lifecycle_status_enum"]
            | null
          award_no?: string | null
          award_reason?: string | null
          awarded_at?: string | null
          awarded_by?: string | null
          created_at?: string | null
          decision_reason?: string | null
          final_amount?: number | null
          final_quotation_id?: string | null
          id?: string
          is_override_selection?: boolean
          ready_for_po?: boolean | null
          recommendation?: string | null
          rfq_id?: string | null
          selection_reason?: string | null
          selection_snapshot?: Json | null
          status?: Database["public"]["Enums"]["award_status"] | null
          supplier_id: string
          tenant_id: string
          updated_at?: string | null
          winning_quotation_id?: string | null
        }
        Update: {
          amount?: number | null
          award_lifecycle_status?:
            | Database["public"]["Enums"]["award_lifecycle_status_enum"]
            | null
          award_no?: string | null
          award_reason?: string | null
          awarded_at?: string | null
          awarded_by?: string | null
          created_at?: string | null
          decision_reason?: string | null
          final_amount?: number | null
          final_quotation_id?: string | null
          id?: string
          is_override_selection?: boolean
          ready_for_po?: boolean | null
          recommendation?: string | null
          rfq_id?: string | null
          selection_reason?: string | null
          selection_snapshot?: Json | null
          status?: Database["public"]["Enums"]["award_status"] | null
          supplier_id?: string
          tenant_id?: string
          updated_at?: string | null
          winning_quotation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_final_quotation_id_fkey"
            columns: ["final_quotation_id"]
            isOneToOne: false
            referencedRelation: "final_quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_winning_quotation_id_fkey"
            columns: ["winning_quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_entries: {
        Row: {
          bid_amount: number
          bidding_event_id: string
          id: string
          notes: string | null
          round_number: number | null
          submitted_at: string | null
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          bid_amount: number
          bidding_event_id: string
          id?: string
          notes?: string | null
          round_number?: number | null
          submitted_at?: string | null
          supplier_id: string
          tenant_id: string
        }
        Update: {
          bid_amount?: number
          bidding_event_id?: string
          id?: string
          notes?: string | null
          round_number?: number | null
          submitted_at?: string | null
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bid_entries_bidding_event_id_fkey"
            columns: ["bidding_event_id"]
            isOneToOne: false
            referencedRelation: "bidding_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_events: {
        Row: {
          created_at: string | null
          created_by: string | null
          current_round: number | null
          description: string | null
          end_time: string | null
          id: string
          max_rounds: number | null
          rfq_id: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["bidding_status"] | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          current_round?: number | null
          description?: string | null
          end_time?: string | null
          id?: string
          max_rounds?: number | null
          rfq_id?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["bidding_status"] | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          current_round?: number | null
          description?: string | null
          end_time?: string | null
          id?: string
          max_rounds?: number | null
          rfq_id?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["bidding_status"] | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bidding_events_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidding_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bidding_status_logs: {
        Row: {
          bidding_event_id: string
          changed_at: string
          changed_by: string | null
          from_status: string
          id: string
          reason: string | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          bidding_event_id: string
          changed_at?: string
          changed_by?: string | null
          from_status: string
          id?: string
          reason?: string | null
          tenant_id?: string
          to_status: string
        }
        Update: {
          bidding_event_id?: string
          changed_at?: string
          changed_by?: string | null
          from_status?: string
          id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bidding_status_logs_bidding_event_id_fkey"
            columns: ["bidding_event_id"]
            isOneToOne: false
            referencedRelation: "bidding_events"
            referencedColumns: ["id"]
          },
        ]
      }
      brc_criteria_audit: {
        Row: {
          action: string
          after_state: Json | null
          before_state: Json | null
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          rolled_back_at: string | null
          rolled_back_by: string | null
          summary: string
          supplier_type: string
        }
        Insert: {
          action: string
          after_state?: Json | null
          before_state?: Json | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          summary: string
          supplier_type: string
        }
        Update: {
          action?: string
          after_state?: Json | null
          before_state?: Json | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          summary?: string
          supplier_type?: string
        }
        Relationships: []
      }
      brc_evidence: {
        Row: {
          created_at: string
          expiry_date: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          note: string | null
          option_id: string | null
          supplier_id: string
          topic_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          note?: string | null
          option_id?: string | null
          supplier_id: string
          topic_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          note?: string | null
          option_id?: string | null
          supplier_id?: string
          topic_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brc_evidence_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "brc_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brc_evidence_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brc_evidence_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "brc_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      brc_grade_bands: {
        Row: {
          grade: string
          id: string
          label_th: string
          max_score: number
          min_score: number
          supplier_type: string
        }
        Insert: {
          grade: string
          id?: string
          label_th: string
          max_score: number
          min_score: number
          supplier_type: string
        }
        Update: {
          grade?: string
          id?: string
          label_th?: string
          max_score?: number
          min_score?: number
          supplier_type?: string
        }
        Relationships: []
      }
      brc_manual_scores: {
        Row: {
          id: string
          note: string | null
          option_id: string | null
          scored_at: string | null
          scored_by: string | null
          supplier_id: string
          topic_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          option_id?: string | null
          scored_at?: string | null
          scored_by?: string | null
          supplier_id: string
          topic_id: string
        }
        Update: {
          id?: string
          note?: string | null
          option_id?: string | null
          scored_at?: string | null
          scored_by?: string | null
          supplier_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brc_manual_scores_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "brc_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brc_manual_scores_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brc_manual_scores_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "brc_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      brc_options: {
        Row: {
          created_at: string | null
          expired_policy: string
          id: string
          is_mandatory: boolean
          label: string
          match_keywords: string[]
          match_type: string
          requirement: string | null
          score: number
          sort_order: number
          topic_id: string
        }
        Insert: {
          created_at?: string | null
          expired_policy?: string
          id?: string
          is_mandatory?: boolean
          label: string
          match_keywords?: string[]
          match_type?: string
          requirement?: string | null
          score?: number
          sort_order?: number
          topic_id: string
        }
        Update: {
          created_at?: string | null
          expired_policy?: string
          id?: string
          is_mandatory?: boolean
          label?: string
          match_keywords?: string[]
          match_type?: string
          requirement?: string | null
          score?: number
          sort_order?: number
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brc_options_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "brc_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      brc_supplier_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          key: string
          label_th: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          key: string
          label_th: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          key?: string
          label_th?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      brc_topics: {
        Row: {
          active: boolean
          auto_source: string
          created_at: string | null
          criterion_group: string
          id: string
          quotation_field: string | null
          scoring_mode: string
          section: string
          sort_order: number
          supplier_type: string
          target_score: number
          topic: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          auto_source?: string
          created_at?: string | null
          criterion_group?: string
          id?: string
          quotation_field?: string | null
          scoring_mode?: string
          section: string
          sort_order?: number
          supplier_type: string
          target_score?: number
          topic: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          auto_source?: string
          created_at?: string | null
          criterion_group?: string
          id?: string
          quotation_field?: string | null
          scoring_mode?: string
          section?: string
          sort_order?: number
          supplier_type?: string
          target_score?: number
          topic?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      brc_weight_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          new_commercial: number
          new_safety: number
          old_commercial: number | null
          old_safety: number | null
          supplier_type: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_commercial: number
          new_safety: number
          old_commercial?: number | null
          old_safety?: number | null
          supplier_type: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          new_commercial?: number
          new_safety?: number
          old_commercial?: number | null
          old_safety?: number | null
          supplier_type?: string
        }
        Relationships: []
      }
      brc_weight_config: {
        Row: {
          commercial_weight: number
          safety_weight: number
          supplier_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commercial_weight?: number
          safety_weight?: number
          supplier_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commercial_weight?: number
          safety_weight?: number
          supplier_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      catalog_cert_requirements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          match_keywords: string[]
          price_list_id: string | null
          price_list_item_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          match_keywords?: string[]
          price_list_id?: string | null
          price_list_item_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          match_keywords?: string[]
          price_list_id?: string | null
          price_list_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_cert_requirements_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_cert_requirements_price_list_item_id_fkey"
            columns: ["price_list_item_id"]
            isOneToOne: false
            referencedRelation: "price_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      company_document_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          has_expiry: boolean
          id: string
          is_required: boolean
          name_th: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          has_expiry?: boolean
          id?: string
          is_required?: boolean
          name_th: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          has_expiry?: boolean
          id?: string
          is_required?: boolean
          name_th?: string
          sort_order?: number
        }
        Relationships: []
      }
      final_quotations: {
        Row: {
          attachment_url: string | null
          bidding_event_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          delivery_terms: string | null
          id: string
          is_selected: boolean | null
          notes: string | null
          payment_terms: string | null
          quotation_id: string | null
          ready_for_po: boolean | null
          rfq_id: string | null
          status: string | null
          supplier_id: string
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          attachment_url?: string | null
          bidding_event_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivery_terms?: string | null
          id?: string
          is_selected?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          quotation_id?: string | null
          ready_for_po?: boolean | null
          rfq_id?: string | null
          status?: string | null
          supplier_id: string
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          attachment_url?: string | null
          bidding_event_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivery_terms?: string | null
          id?: string
          is_selected?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          quotation_id?: string | null
          ready_for_po?: boolean | null
          rfq_id?: string | null
          status?: string | null
          supplier_id?: string
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "final_quotations_bidding_event_id_fkey"
            columns: ["bidding_event_id"]
            isOneToOne: false
            referencedRelation: "bidding_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_quotations_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_quotations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_quotations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_quotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          message: string | null
          tenant_id: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          tenant_id: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          tenant_id?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_item_suppliers: {
        Row: {
          coa_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_preferred: boolean
          lead_time_days: number | null
          moq: number | null
          notes: string | null
          price_list_item_id: string
          reference_quotation_date: string | null
          reference_quotation_no: string | null
          spec_url: string | null
          supplier_id: string
          tenant_id: string
          unit_price: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          coa_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          price_list_item_id: string
          reference_quotation_date?: string | null
          reference_quotation_no?: string | null
          spec_url?: string | null
          supplier_id: string
          tenant_id: string
          unit_price: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          coa_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_preferred?: boolean
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          price_list_item_id?: string
          reference_quotation_date?: string | null
          reference_quotation_no?: string | null
          spec_url?: string | null
          supplier_id?: string
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_item_suppliers_price_list_item_id_fkey"
            columns: ["price_list_item_id"]
            isOneToOne: false
            referencedRelation: "price_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_item_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_item_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          abc_class: number | null
          avg_quantity: number | null
          avg_trans_value: number | null
          created_at: string | null
          description: string | null
          designated_at: string | null
          designated_by: string | null
          designated_supplier_id: string | null
          designation_note: string | null
          group_name: string | null
          id: string
          is_nominated: boolean
          item_code: string | null
          item_name: string
          lead_time_days: number | null
          moq: number | null
          nominated_customer: string | null
          nomination_date: string | null
          nomination_letter_url: string | null
          nomination_qa_note: string | null
          nomination_status:
            | Database["public"]["Enums"]["nomination_status_enum"]
            | null
          num_suppliers: number | null
          price_list_id: string
          priority_score: number | null
          qa_reviewed_at: string | null
          qa_reviewed_by: string | null
          reference_price: number | null
          risk_label: string | null
          seasonality_score: number | null
          sort_order: number
          target_quantity: number | null
          tenant_id: string
          total_quantity: number | null
          total_trans_value: number | null
          unit: string | null
          updated_at: string
          xyz_class: number | null
        }
        Insert: {
          abc_class?: number | null
          avg_quantity?: number | null
          avg_trans_value?: number | null
          created_at?: string | null
          description?: string | null
          designated_at?: string | null
          designated_by?: string | null
          designated_supplier_id?: string | null
          designation_note?: string | null
          group_name?: string | null
          id?: string
          is_nominated?: boolean
          item_code?: string | null
          item_name: string
          lead_time_days?: number | null
          moq?: number | null
          nominated_customer?: string | null
          nomination_date?: string | null
          nomination_letter_url?: string | null
          nomination_qa_note?: string | null
          nomination_status?:
            | Database["public"]["Enums"]["nomination_status_enum"]
            | null
          num_suppliers?: number | null
          price_list_id: string
          priority_score?: number | null
          qa_reviewed_at?: string | null
          qa_reviewed_by?: string | null
          reference_price?: number | null
          risk_label?: string | null
          seasonality_score?: number | null
          sort_order?: number
          target_quantity?: number | null
          tenant_id: string
          total_quantity?: number | null
          total_trans_value?: number | null
          unit?: string | null
          updated_at?: string
          xyz_class?: number | null
        }
        Update: {
          abc_class?: number | null
          avg_quantity?: number | null
          avg_trans_value?: number | null
          created_at?: string | null
          description?: string | null
          designated_at?: string | null
          designated_by?: string | null
          designated_supplier_id?: string | null
          designation_note?: string | null
          group_name?: string | null
          id?: string
          is_nominated?: boolean
          item_code?: string | null
          item_name?: string
          lead_time_days?: number | null
          moq?: number | null
          nominated_customer?: string | null
          nomination_date?: string | null
          nomination_letter_url?: string | null
          nomination_qa_note?: string | null
          nomination_status?:
            | Database["public"]["Enums"]["nomination_status_enum"]
            | null
          num_suppliers?: number | null
          price_list_id?: string
          priority_score?: number | null
          qa_reviewed_at?: string | null
          qa_reviewed_by?: string | null
          reference_price?: number | null
          risk_label?: string | null
          seasonality_score?: number | null
          sort_order?: number
          target_quantity?: number | null
          tenant_id?: string
          total_quantity?: number | null
          total_trans_value?: number | null
          unit?: string | null
          updated_at?: string
          xyz_class?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_designated_supplier_id_fkey"
            columns: ["designated_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_quotation_history: {
        Row: {
          id: string
          lead_time_days: number | null
          moq: number | null
          notes: string | null
          price_list_item_id: string
          reference_quotation_no: string | null
          rfq_number: string | null
          source: string
          submitted_at: string
          submitted_by: string | null
          supplier_id: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          price_list_item_id: string
          reference_quotation_no?: string | null
          rfq_number?: string | null
          source?: string
          submitted_at?: string
          submitted_by?: string | null
          supplier_id: string
          tenant_id: string
          unit_price: number
        }
        Update: {
          id?: string
          lead_time_days?: number | null
          moq?: number | null
          notes?: string | null
          price_list_item_id?: string
          reference_quotation_no?: string | null
          rfq_number?: string | null
          source?: string
          submitted_at?: string
          submitted_by?: string | null
          supplier_id?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_quotation_history_price_list_item_id_fkey"
            columns: ["price_list_item_id"]
            isOneToOne: false
            referencedRelation: "price_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_quotation_history_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_quotation_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_quotation_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_visible_suppliers: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          price_list_id: string
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          price_list_id: string
          supplier_id: string
          tenant_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          price_list_id?: string
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_visible_suppliers_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_visible_suppliers_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_visible_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_visible_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          attachment_url: string | null
          category: Database["public"]["Enums"]["price_list_category_enum"]
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          status: Database["public"]["Enums"]["price_list_status"] | null
          supplier_id: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
          version: number | null
        }
        Insert: {
          attachment_url?: string | null
          category?: Database["public"]["Enums"]["price_list_category_enum"]
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          status?: Database["public"]["Enums"]["price_list_status"] | null
          supplier_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          version?: number | null
        }
        Update: {
          attachment_url?: string | null
          category?: Database["public"]["Enums"]["price_list_category_enum"]
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          status?: Database["public"]["Enums"]["price_list_status"] | null
          supplier_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          supplier_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          supplier_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          supplier_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_supplier"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          created_at: string | null
          id: string
          item_name: string
          notes: string | null
          quantity: number | null
          quotation_id: string
          rfq_item_id: string | null
          tenant_id: string
          total_price: number | null
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number | null
          quotation_id: string
          rfq_item_id?: string | null
          tenant_id: string
          total_price?: number | null
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number | null
          quotation_id?: string
          rfq_item_id?: string | null
          tenant_id?: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_rfq_item_id_fkey"
            columns: ["rfq_item_id"]
            isOneToOne: false
            referencedRelation: "rfq_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_technical_responses: {
        Row: {
          created_at: string
          criterion_id: string
          id: string
          is_met: boolean
          quotation_id: string
          tenant_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          criterion_id: string
          id?: string
          is_met?: boolean
          quotation_id: string
          tenant_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          criterion_id?: string
          id?: string
          is_met?: boolean
          quotation_id?: string
          tenant_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_technical_responses_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rfq_technical_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_technical_responses_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_technical_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          attachment_url: string | null
          commercial_score: number | null
          created_at: string | null
          credit_term_days: number | null
          currency: string | null
          delivery_terms: string | null
          discount: number | null
          evaluation_status:
            | Database["public"]["Enums"]["quotation_status_enum"]
            | null
          final_score: number | null
          id: string
          is_recommended_winner: boolean
          lead_time_days: number | null
          notes: string | null
          payment_term: string | null
          payment_terms: string | null
          price: number | null
          quotation_no: string | null
          rank: number | null
          remark: string | null
          revised_at: string | null
          rfq_id: string
          risk_score: number | null
          spec_compliance_score: number | null
          submitted_at: string | null
          supplier_id: string
          technical_score: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          validity_date: string | null
          validity_days: number | null
          vat: number | null
          version: number | null
          warranty: string | null
        }
        Insert: {
          attachment_url?: string | null
          commercial_score?: number | null
          created_at?: string | null
          credit_term_days?: number | null
          currency?: string | null
          delivery_terms?: string | null
          discount?: number | null
          evaluation_status?:
            | Database["public"]["Enums"]["quotation_status_enum"]
            | null
          final_score?: number | null
          id?: string
          is_recommended_winner?: boolean
          lead_time_days?: number | null
          notes?: string | null
          payment_term?: string | null
          payment_terms?: string | null
          price?: number | null
          quotation_no?: string | null
          rank?: number | null
          remark?: string | null
          revised_at?: string | null
          rfq_id: string
          risk_score?: number | null
          spec_compliance_score?: number | null
          submitted_at?: string | null
          supplier_id: string
          technical_score?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
          validity_date?: string | null
          validity_days?: number | null
          vat?: number | null
          version?: number | null
          warranty?: string | null
        }
        Update: {
          attachment_url?: string | null
          commercial_score?: number | null
          created_at?: string | null
          credit_term_days?: number | null
          currency?: string | null
          delivery_terms?: string | null
          discount?: number | null
          evaluation_status?:
            | Database["public"]["Enums"]["quotation_status_enum"]
            | null
          final_score?: number | null
          id?: string
          is_recommended_winner?: boolean
          lead_time_days?: number | null
          notes?: string | null
          payment_term?: string | null
          payment_terms?: string | null
          price?: number | null
          quotation_no?: string | null
          rank?: number | null
          remark?: string | null
          revised_at?: string | null
          rfq_id?: string
          risk_score?: number | null
          spec_compliance_score?: number | null
          submitted_at?: string | null
          supplier_id?: string
          technical_score?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
          validity_date?: string | null
          validity_days?: number | null
          vat?: number | null
          version?: number | null
          warranty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_evaluations: {
        Row: {
          commercial_score: number | null
          commercial_weight: number
          created_at: string | null
          evaluated_at: string | null
          evaluated_by: string | null
          final_score: number | null
          id: string
          is_recommended_winner: boolean | null
          lead_time_score: number | null
          payment_term_score: number | null
          price_score: number | null
          quotation_id: string
          rank: number | null
          rfq_id: string
          risk_score: number | null
          risk_weight: number
          supplier_id: string
          technical_score: number | null
          technical_weight: number
          tenant_id: string
          warnings: Json | null
        }
        Insert: {
          commercial_score?: number | null
          commercial_weight?: number
          created_at?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          final_score?: number | null
          id?: string
          is_recommended_winner?: boolean | null
          lead_time_score?: number | null
          payment_term_score?: number | null
          price_score?: number | null
          quotation_id: string
          rank?: number | null
          rfq_id: string
          risk_score?: number | null
          risk_weight?: number
          supplier_id: string
          technical_score?: number | null
          technical_weight?: number
          tenant_id: string
          warnings?: Json | null
        }
        Update: {
          commercial_score?: number | null
          commercial_weight?: number
          created_at?: string | null
          evaluated_at?: string | null
          evaluated_by?: string | null
          final_score?: number | null
          id?: string
          is_recommended_winner?: boolean | null
          lead_time_score?: number | null
          payment_term_score?: number | null
          price_score?: number | null
          quotation_id?: string
          rank?: number | null
          rfq_id?: string
          risk_score?: number | null
          risk_weight?: number
          supplier_id?: string
          technical_score?: number | null
          technical_weight?: number
          tenant_id?: string
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_evaluations_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_evaluations_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_evaluations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_items: {
        Row: {
          created_at: string | null
          description: string | null
          estimated_budget: number | null
          id: string
          item_name: string
          quantity: number | null
          required_date: string | null
          rfq_id: string
          source_price_list_item_id: string | null
          specification: string | null
          specifications: string | null
          technical_requirement: string | null
          tenant_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          estimated_budget?: number | null
          id?: string
          item_name: string
          quantity?: number | null
          required_date?: string | null
          rfq_id: string
          source_price_list_item_id?: string | null
          specification?: string | null
          specifications?: string | null
          technical_requirement?: string | null
          tenant_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          estimated_budget?: number | null
          id?: string
          item_name?: string
          quantity?: number | null
          required_date?: string | null
          rfq_id?: string
          source_price_list_item_id?: string | null
          specification?: string | null
          specifications?: string | null
          technical_requirement?: string | null
          tenant_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_source_price_list_item_id_fkey"
            columns: ["source_price_list_item_id"]
            isOneToOne: false
            referencedRelation: "price_list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_supplier_removals: {
        Row: {
          id: string
          reason: string
          removed_at: string
          removed_by: string | null
          rfq_id: string
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          reason: string
          removed_at?: string
          removed_by?: string | null
          rfq_id: string
          supplier_id: string
          tenant_id?: string
        }
        Update: {
          id?: string
          reason?: string
          removed_at?: string
          removed_by?: string | null
          rfq_id?: string
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_supplier_removals_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_supplier_removals_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_suppliers: {
        Row: {
          declined_at: string | null
          declined_reason: string | null
          eligibility_notes: string | null
          eligibility_status: string | null
          id: string
          invited_at: string | null
          override_approved_at: string | null
          override_approved_by: string | null
          responded: boolean | null
          rfq_id: string
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          declined_at?: string | null
          declined_reason?: string | null
          eligibility_notes?: string | null
          eligibility_status?: string | null
          id?: string
          invited_at?: string | null
          override_approved_at?: string | null
          override_approved_by?: string | null
          responded?: boolean | null
          rfq_id: string
          supplier_id: string
          tenant_id: string
        }
        Update: {
          declined_at?: string | null
          declined_reason?: string | null
          eligibility_notes?: string | null
          eligibility_status?: string | null
          id?: string
          invited_at?: string | null
          override_approved_at?: string | null
          override_approved_by?: string | null
          responded?: boolean | null
          rfq_id?: string
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_suppliers_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_technical_criteria: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          label: string
          rfq_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          label: string
          rfq_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          label?: string
          rfq_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "rfq_technical_criteria_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_technical_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          budget: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deadline: string | null
          department: string | null
          description: string | null
          id: string
          notes: string | null
          published_at: string | null
          requester: string | null
          requester_id: string | null
          required_date: string | null
          rfq_number: string | null
          status: Database["public"]["Enums"]["rfq_status"] | null
          submission_deadline: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          workflow_status: string | null
        }
        Insert: {
          budget?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          department?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          requester?: string | null
          requester_id?: string | null
          required_date?: string | null
          rfq_number?: string | null
          status?: Database["public"]["Enums"]["rfq_status"] | null
          submission_deadline?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          workflow_status?: string | null
        }
        Update: {
          budget?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deadline?: string | null
          department?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          published_at?: string | null
          requester?: string | null
          requester_id?: string | null
          required_date?: string | null
          rfq_number?: string | null
          status?: Database["public"]["Enums"]["rfq_status"] | null
          submission_deadline?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          workflow_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_criteria: {
        Row: {
          active: boolean
          category: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          dimension: string
          id: string
          is_mandatory: boolean
          match_keywords: string[]
          match_type: string
          name_th: string
          sort_order: number
          tenant_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dimension: string
          id?: string
          is_mandatory?: boolean
          match_keywords?: string[]
          match_type?: string
          name_th: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          category?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          dimension?: string
          id?: string
          is_mandatory?: boolean
          match_keywords?: string[]
          match_type?: string
          name_th?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_blacklist_history: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          id: string
          reason: string | null
          supplier_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          reason?: string | null
          supplier_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          id?: string
          reason?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_blacklist_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_brc_types: {
        Row: {
          assessed_at: string | null
          created_at: string
          grade: string | null
          id: string
          is_primary: boolean
          percent: number | null
          supplier_id: string
          supplier_type: string
        }
        Insert: {
          assessed_at?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          is_primary?: boolean
          percent?: number | null
          supplier_id: string
          supplier_type: string
        }
        Update: {
          assessed_at?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          is_primary?: boolean
          percent?: number | null
          supplier_id?: string
          supplier_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_brc_types_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_certificates: {
        Row: {
          certificate_no: string | null
          certificate_type: string
          created_at: string | null
          created_by: string | null
          expiry_date: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_primary: boolean
          issued_by: string | null
          issued_date: string | null
          notes: string | null
          supplier_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          certificate_no?: string | null
          certificate_type: string
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_primary?: boolean
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          supplier_id: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          certificate_no?: string | null
          certificate_type?: string
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_primary?: boolean
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          supplier_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_certificates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contact_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          supplier_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          supplier_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contact_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          contact_name: string
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          phone: string | null
          position: string | null
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          contact_name: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string | null
          position?: string | null
          supplier_id: string
          tenant_id: string
        }
        Update: {
          contact_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          phone?: string | null
          position?: string | null
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          created_at: string | null
          document_name: string
          document_type: string | null
          document_type_id: string | null
          expiry_date: string | null
          file_size: number | null
          file_url: string | null
          id: string
          supplier_id: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_name: string
          document_type?: string | null
          document_type_id?: string | null
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          supplier_id: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_name?: string
          document_type?: string | null
          document_type_id?: string | null
          expiry_date?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          supplier_id?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "company_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ncrs: {
        Row: {
          assigned_to: string | null
          capa_due_date: string | null
          category: string
          closed_date: string | null
          corrective_action: string | null
          created_at: string
          created_by: string | null
          description: string
          detected_by: string | null
          detected_date: string
          evidence_url: string | null
          id: string
          lot_number: string | null
          ncr_number: string | null
          product_description: string | null
          rfq_id: string | null
          root_cause: string | null
          severity: Database["public"]["Enums"]["ncr_severity_enum"]
          status: Database["public"]["Enums"]["ncr_status_enum"]
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          capa_due_date?: string | null
          category: string
          closed_date?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          detected_by?: string | null
          detected_date?: string
          evidence_url?: string | null
          id?: string
          lot_number?: string | null
          ncr_number?: string | null
          product_description?: string | null
          rfq_id?: string | null
          root_cause?: string | null
          severity?: Database["public"]["Enums"]["ncr_severity_enum"]
          status?: Database["public"]["Enums"]["ncr_status_enum"]
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          capa_due_date?: string | null
          category?: string
          closed_date?: string | null
          corrective_action?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          detected_by?: string | null
          detected_date?: string
          evidence_url?: string | null
          id?: string
          lot_number?: string | null
          ncr_number?: string | null
          product_description?: string | null
          rfq_id?: string | null
          root_cause?: string | null
          severity?: Database["public"]["Enums"]["ncr_severity_enum"]
          status?: Database["public"]["Enums"]["ncr_status_enum"]
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ncrs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ncrs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ncrs_detected_by_fkey"
            columns: ["detected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ncrs_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ncrs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ncrs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_risk_assessments: {
        Row: {
          allergen_risk: number
          assessed_at: string | null
          assessed_by: string | null
          certificate_risk: number
          country_risk: number
          created_at: string | null
          critical_material_risk: number
          delivery_risk: number
          financial_risk: number
          food_fraud_risk: number
          food_safety_risk: number
          id: string
          manual_overrides: Json
          ncr_history_risk: number
          notes: string | null
          quality_risk: number
          supplier_id: string
          tenant_id: string
          total_risk_score: number | null
          updated_at: string | null
        }
        Insert: {
          allergen_risk?: number
          assessed_at?: string | null
          assessed_by?: string | null
          certificate_risk?: number
          country_risk?: number
          created_at?: string | null
          critical_material_risk?: number
          delivery_risk?: number
          financial_risk?: number
          food_fraud_risk?: number
          food_safety_risk?: number
          id?: string
          manual_overrides?: Json
          ncr_history_risk?: number
          notes?: string | null
          quality_risk?: number
          supplier_id: string
          tenant_id: string
          total_risk_score?: number | null
          updated_at?: string | null
        }
        Update: {
          allergen_risk?: number
          assessed_at?: string | null
          assessed_by?: string | null
          certificate_risk?: number
          country_risk?: number
          created_at?: string | null
          critical_material_risk?: number
          delivery_risk?: number
          financial_risk?: number
          food_fraud_risk?: number
          food_safety_risk?: number
          id?: string
          manual_overrides?: Json
          ncr_history_risk?: number
          notes?: string | null
          quality_risk?: number
          supplier_id?: string
          tenant_id?: string
          total_risk_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_risk_assessments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_risk_assessments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          abc_class: number | null
          address: string | null
          approved_at: string | null
          approved_by: string | null
          blacklist_reason: string | null
          blacklisted_at: string | null
          blacklisted_by: string | null
          blacklisted_by_email: string | null
          brc_assessed_at: string | null
          brc_grade: string | null
          brc_percent: number | null
          brc_supplier_type: string | null
          category: string | null
          certificate_expiry_date: string | null
          certificate_type: string | null
          city: string | null
          company_name: string
          contact_person: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_blacklisted: boolean | null
          is_preferred: boolean | null
          notes: string | null
          num_items: number | null
          performance_score: number | null
          phone: string | null
          priority_score: number | null
          qa_approval_status:
            | Database["public"]["Enums"]["qa_approval_status_enum"]
            | null
          rejected_at: string | null
          rejection_reason: string | null
          resubmitted_at: string | null
          risk_label: string | null
          risk_level: Database["public"]["Enums"]["risk_level_enum"] | null
          seasonality_score: number | null
          status: Database["public"]["Enums"]["supplier_status"] | null
          supplier_code: string | null
          supplier_name: string | null
          supplier_type:
            | Database["public"]["Enums"]["supplier_type_enum"]
            | null
          tax_id: string | null
          tenant_id: string
          tier: Database["public"]["Enums"]["supplier_tier"] | null
          total_spend: number | null
          updated_at: string | null
          website: string | null
          xyz_class: number | null
        }
        Insert: {
          abc_class?: number | null
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          blacklist_reason?: string | null
          blacklisted_at?: string | null
          blacklisted_by?: string | null
          blacklisted_by_email?: string | null
          brc_assessed_at?: string | null
          brc_grade?: string | null
          brc_percent?: number | null
          brc_supplier_type?: string | null
          category?: string | null
          certificate_expiry_date?: string | null
          certificate_type?: string | null
          city?: string | null
          company_name: string
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_blacklisted?: boolean | null
          is_preferred?: boolean | null
          notes?: string | null
          num_items?: number | null
          performance_score?: number | null
          phone?: string | null
          priority_score?: number | null
          qa_approval_status?:
            | Database["public"]["Enums"]["qa_approval_status_enum"]
            | null
          rejected_at?: string | null
          rejection_reason?: string | null
          resubmitted_at?: string | null
          risk_label?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level_enum"] | null
          seasonality_score?: number | null
          status?: Database["public"]["Enums"]["supplier_status"] | null
          supplier_code?: string | null
          supplier_name?: string | null
          supplier_type?:
            | Database["public"]["Enums"]["supplier_type_enum"]
            | null
          tax_id?: string | null
          tenant_id: string
          tier?: Database["public"]["Enums"]["supplier_tier"] | null
          total_spend?: number | null
          updated_at?: string | null
          website?: string | null
          xyz_class?: number | null
        }
        Update: {
          abc_class?: number | null
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          blacklist_reason?: string | null
          blacklisted_at?: string | null
          blacklisted_by?: string | null
          blacklisted_by_email?: string | null
          brc_assessed_at?: string | null
          brc_grade?: string | null
          brc_percent?: number | null
          brc_supplier_type?: string | null
          category?: string | null
          certificate_expiry_date?: string | null
          certificate_type?: string | null
          city?: string | null
          company_name?: string
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_blacklisted?: boolean | null
          is_preferred?: boolean | null
          notes?: string | null
          num_items?: number | null
          performance_score?: number | null
          phone?: string | null
          priority_score?: number | null
          qa_approval_status?:
            | Database["public"]["Enums"]["qa_approval_status_enum"]
            | null
          rejected_at?: string | null
          rejection_reason?: string | null
          resubmitted_at?: string | null
          risk_label?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level_enum"] | null
          seasonality_score?: number | null
          status?: Database["public"]["Enums"]["supplier_status"] | null
          supplier_code?: string | null
          supplier_name?: string | null
          supplier_type?:
            | Database["public"]["Enums"]["supplier_type_enum"]
            | null
          tax_id?: string | null
          tenant_id?: string
          tier?: Database["public"]["Enums"]["supplier_tier"] | null
          total_spend?: number | null
          updated_at?: string | null
          website?: string | null
          xyz_class?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          tenant_id: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          tenant_id: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          key?: string
          tenant_id?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          created_at: string | null
          id: string
          is_enabled: boolean | null
          module_key: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          module_key: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          module_key?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_role_modules: {
        Row: {
          created_at: string | null
          id: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          module_key: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          module_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_role_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_suppliers: {
        Row: {
          id: string
          linked_at: string
          linked_by: string | null
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          linked_at?: string
          linked_by?: string | null
          supplier_id: string
          tenant_id: string
        }
        Update: {
          id?: string
          linked_at?: string
          linked_by?: string | null
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          supplier_sharing_enabled: boolean
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          supplier_sharing_enabled?: boolean
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          supplier_sharing_enabled?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tenant_access: {
        Row: {
          created_at: string | null
          granted_by: string | null
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenant_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tenant_access_user_id_profiles_fkey"
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
      add_catalog_category_value: {
        Args: { p_value: string }
        Returns: undefined
      }
      admin_create_supplier_with_user: {
        Args: {
          p_address?: string
          p_city?: string
          p_company_name: string
          p_country?: string
          p_email: string
          p_notes?: string
          p_password?: string
          p_phone?: string
          p_tax_id?: string
          p_tier?: string
          p_website?: string
        }
        Returns: Json
      }
      admin_delete_supplier: {
        Args: { p_supplier_id: string }
        Returns: undefined
      }
      admin_reactivate_supplier: {
        Args: { p_supplier_id: string }
        Returns: undefined
      }
      admin_reset_or_create_supplier_login: {
        Args: { p_new_password: string; p_supplier_id: string }
        Returns: Json
      }
      admin_reset_supplier_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: undefined
      }
      admin_suspend_supplier: {
        Args: { p_reason?: string; p_supplier_id: string }
        Returns: undefined
      }
      can_manage_quotations: { Args: never; Returns: boolean }
      check_supplier_transactions: {
        Args: { p_supplier_id: string }
        Returns: Json
      }
      classify_risk_level: {
        Args: { score: number }
        Returns: Database["public"]["Enums"]["risk_level_enum"]
      }
      clear_transaction_data: { Args: never; Returns: Json }
      compute_ncr_risk_score: {
        Args: { p_supplier_id: string }
        Returns: number
      }
      count_transaction_data: { Args: never; Returns: Json }
      create_supplier_auth_accounts: {
        Args: { p_default_password?: string }
        Returns: Json
      }
      create_tenant: {
        Args: { _modules?: string[]; _name: string; _slug: string }
        Returns: string
      }
      current_supplier_id: { Args: never; Returns: string }
      get_user_accessible_tenants: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_procurement_staff: { Args: never; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      link_my_supplier_account: { Args: never; Returns: string }
      link_supplier_to_tenant: {
        Args: { _supplier_id: string; _tenant_id: string }
        Returns: undefined
      }
      my_visible_catalog_ids: { Args: never; Returns: string[] }
      supplier_resubmit_registration: { Args: never; Returns: Json }
      switch_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      sync_supplier_brc_risk: {
        Args: {
          p_grade: string
          p_level: string
          p_percent: number
          p_supplier_id: string
        }
        Returns: undefined
      }
      sync_supplier_brc_type_risk: {
        Args: {
          p_grade: string
          p_level: string
          p_percent: number
          p_supplier_id: string
          p_type: string
        }
        Returns: undefined
      }
      toggle_supplier_sharing: {
        Args: { _enabled: boolean; _tenant_id: string }
        Returns: undefined
      }
      unlink_supplier_from_tenant: {
        Args: { _supplier_id: string; _tenant_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "procurement_officer"
        | "approver"
        | "executive"
        | "supplier"
        | "super_admin"
      approval_decision_enum: "pending" | "approved" | "rejected" | "skipped"
      approval_level_enum:
        | "buyer"
        | "procurement_manager"
        | "qa"
        | "finance"
        | "director"
      award_lifecycle_status_enum:
        | "draft"
        | "pending_approval"
        | "awarded"
        | "cancelled"
        | "approved"
        | "rejected"
        | "po_issued"
        | "completed"
      award_status: "pending" | "approved" | "rejected" | "revise"
      bidding_status: "scheduled" | "active" | "closed" | "cancelled"
      ncr_severity_enum: "minor" | "major" | "critical"
      ncr_status_enum: "open" | "in_progress" | "closed" | "cancelled"
      nomination_status_enum:
        | "pending_customer"
        | "qa_review"
        | "conditional_approved"
        | "approved"
        | "rejected"
        | "blocked"
      price_list_category_enum:
        | "raw_material"
        | "packaging"
        | "service"
        | "other"
        | "rm_primary_pk"
        | "secondary_pk"
        | "chemical_food"
        | "chemical_nonfood"
        | "equipment_food"
        | "equipment_nonfood"
      price_list_status: "draft" | "submitted" | "active" | "expired"
      qa_approval_status_enum:
        | "not_required"
        | "pending"
        | "approved"
        | "rejected"
      quotation_status_enum:
        | "draft"
        | "submitted"
        | "under_review"
        | "awarded"
        | "not_awarded"
        | "rejected"
        | "withdrawn"
      rfq_status: "draft" | "published" | "closed" | "evaluation" | "awarded"
      risk_level_enum: "low" | "medium" | "high" | "critical"
      supplier_status:
        | "draft"
        | "submitted"
        | "review"
        | "approved"
        | "rejected"
        | "suspended"
      supplier_tier: "critical_tier_1" | "non_critical_tier_1"
      supplier_type_enum:
        | "approved"
        | "new"
        | "nominated"
        | "critical"
        | "blocked"
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
  public: {
    Enums: {
      app_role: [
        "admin",
        "procurement_officer",
        "approver",
        "executive",
        "supplier",
        "super_admin",
      ],
      approval_decision_enum: ["pending", "approved", "rejected", "skipped"],
      approval_level_enum: [
        "buyer",
        "procurement_manager",
        "qa",
        "finance",
        "director",
      ],
      award_lifecycle_status_enum: [
        "draft",
        "pending_approval",
        "awarded",
        "cancelled",
        "approved",
        "rejected",
        "po_issued",
        "completed",
      ],
      award_status: ["pending", "approved", "rejected", "revise"],
      bidding_status: ["scheduled", "active", "closed", "cancelled"],
      ncr_severity_enum: ["minor", "major", "critical"],
      ncr_status_enum: ["open", "in_progress", "closed", "cancelled"],
      nomination_status_enum: [
        "pending_customer",
        "qa_review",
        "conditional_approved",
        "approved",
        "rejected",
        "blocked",
      ],
      price_list_category_enum: [
        "raw_material",
        "packaging",
        "service",
        "other",
        "rm_primary_pk",
        "secondary_pk",
        "chemical_food",
        "chemical_nonfood",
        "equipment_food",
        "equipment_nonfood",
      ],
      price_list_status: ["draft", "submitted", "active", "expired"],
      qa_approval_status_enum: [
        "not_required",
        "pending",
        "approved",
        "rejected",
      ],
      quotation_status_enum: [
        "draft",
        "submitted",
        "under_review",
        "awarded",
        "not_awarded",
        "rejected",
        "withdrawn",
      ],
      rfq_status: ["draft", "published", "closed", "evaluation", "awarded"],
      risk_level_enum: ["low", "medium", "high", "critical"],
      supplier_status: [
        "draft",
        "submitted",
        "review",
        "approved",
        "rejected",
        "suspended",
      ],
      supplier_tier: ["critical_tier_1", "non_critical_tier_1"],
      supplier_type_enum: [
        "approved",
        "new",
        "nominated",
        "critical",
        "blocked",
      ],
    },
  },
} as const
