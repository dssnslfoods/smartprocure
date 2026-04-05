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
        }
        Relationships: []
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
        }
        Relationships: []
      }
      awards: {
        Row: {
          amount: number | null
          awarded_by: string | null
          created_at: string | null
          decision_reason: string | null
          final_quotation_id: string | null
          id: string
          ready_for_po: boolean | null
          recommendation: string | null
          rfq_id: string | null
          status: Database["public"]["Enums"]["award_status"] | null
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          awarded_by?: string | null
          created_at?: string | null
          decision_reason?: string | null
          final_quotation_id?: string | null
          id?: string
          ready_for_po?: boolean | null
          recommendation?: string | null
          rfq_id?: string | null
          status?: Database["public"]["Enums"]["award_status"] | null
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          awarded_by?: string | null
          created_at?: string | null
          decision_reason?: string | null
          final_quotation_id?: string | null
          id?: string
          ready_for_po?: boolean | null
          recommendation?: string | null
          rfq_id?: string | null
          status?: Database["public"]["Enums"]["award_status"] | null
          supplier_id?: string
          updated_at?: string | null
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
        }
        Insert: {
          bid_amount: number
          bidding_event_id: string
          id?: string
          notes?: string | null
          round_number?: number | null
          submitted_at?: string | null
          supplier_id: string
        }
        Update: {
          bid_amount?: number
          bidding_event_id?: string
          id?: string
          notes?: string | null
          round_number?: number | null
          submitted_at?: string | null
          supplier_id?: string
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
        ]
      }
      evaluation_criteria: {
        Row: {
          created_at: string | null
          criteria_name: string
          description: string | null
          id: string
          sort_order: number | null
          template_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          criteria_name: string
          description?: string | null
          id?: string
          sort_order?: number | null
          template_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          criteria_name?: string
          description?: string | null
          id?: string
          sort_order?: number | null
          template_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_criteria_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evaluation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          template_name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          template_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          template_name?: string
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
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string | null
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
          link?: string | null
          message?: string | null
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
          link?: string | null
          message?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          item_name: string
          lead_time_days: number | null
          moq: number | null
          price_list_id: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name: string
          lead_time_days?: number | null
          moq?: number | null
          price_list_id: string
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name?: string
          lead_time_days?: number | null
          moq?: number | null
          price_list_id?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          status: Database["public"]["Enums"]["price_list_status"] | null
          supplier_id: string
          title: string
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
          version: number | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          status?: Database["public"]["Enums"]["price_list_status"] | null
          supplier_id: string
          title: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
          version?: number | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          status?: Database["public"]["Enums"]["price_list_status"] | null
          supplier_id?: string
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
        ]
      }
      quotations: {
        Row: {
          attachment_url: string | null
          created_at: string | null
          currency: string | null
          delivery_terms: string | null
          id: string
          notes: string | null
          payment_terms: string | null
          revised_at: string | null
          rfq_id: string
          submitted_at: string | null
          supplier_id: string
          total_amount: number | null
          updated_at: string | null
          validity_days: number | null
          version: number | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_terms?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          revised_at?: string | null
          rfq_id: string
          submitted_at?: string | null
          supplier_id: string
          total_amount?: number | null
          updated_at?: string | null
          validity_days?: number | null
          version?: number | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_terms?: string | null
          id?: string
          notes?: string | null
          payment_terms?: string | null
          revised_at?: string | null
          rfq_id?: string
          submitted_at?: string | null
          supplier_id?: string
          total_amount?: number | null
          updated_at?: string | null
          validity_days?: number | null
          version?: number | null
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
        ]
      }
      rfq_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          item_name: string
          quantity: number | null
          rfq_id: string
          specifications: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name: string
          quantity?: number | null
          rfq_id: string
          specifications?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name?: string
          quantity?: number | null
          rfq_id?: string
          specifications?: string | null
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
        ]
      }
      rfq_suppliers: {
        Row: {
          id: string
          invited_at: string | null
          responded: boolean | null
          rfq_id: string
          supplier_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          responded?: boolean | null
          rfq_id: string
          supplier_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          responded?: boolean | null
          rfq_id?: string
          supplier_id?: string
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
        ]
      }
      rfqs: {
        Row: {
          created_at: string | null
          created_by: string | null
          deadline: string | null
          description: string | null
          id: string
          notes: string | null
          rfq_number: string | null
          status: Database["public"]["Enums"]["rfq_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          rfq_number?: string | null
          status?: Database["public"]["Enums"]["rfq_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          rfq_number?: string | null
          status?: Database["public"]["Enums"]["rfq_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
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
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          created_at: string | null
          document_name: string
          document_type: string | null
          file_size: number | null
          file_url: string | null
          id: string
          supplier_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          document_name: string
          document_type?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          supplier_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          document_name?: string
          document_type?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          supplier_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_esg_profiles: {
        Row: {
          compliance_status: string | null
          created_at: string | null
          environmental_score: number | null
          esg_score: number | null
          governance_score: number | null
          id: string
          notes: string | null
          risk_level: string | null
          social_score: number | null
          supplier_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          compliance_status?: string | null
          created_at?: string | null
          environmental_score?: number | null
          esg_score?: number | null
          governance_score?: number | null
          id?: string
          notes?: string | null
          risk_level?: string | null
          social_score?: number | null
          supplier_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          compliance_status?: string | null
          created_at?: string | null
          environmental_score?: number | null
          esg_score?: number | null
          governance_score?: number | null
          id?: string
          notes?: string | null
          risk_level?: string | null
          social_score?: number | null
          supplier_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_esg_profiles_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_evaluation_scores: {
        Row: {
          comment: string | null
          created_at: string | null
          criteria_id: string
          evaluation_id: string
          id: string
          score: number
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          criteria_id: string
          evaluation_id: string
          id?: string
          score: number
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          criteria_id?: string
          evaluation_id?: string
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_evaluation_scores_criteria_id_fkey"
            columns: ["criteria_id"]
            isOneToOne: false
            referencedRelation: "evaluation_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_evaluation_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "supplier_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_evaluations: {
        Row: {
          created_at: string | null
          evaluation_period: string | null
          evaluator_id: string | null
          id: string
          notes: string | null
          status: string | null
          supplier_id: string
          template_id: string | null
          total_score: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          evaluation_period?: string | null
          evaluator_id?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          supplier_id: string
          template_id?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          evaluation_period?: string | null
          evaluator_id?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          supplier_id?: string
          template_id?: string | null
          total_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_evaluations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_evaluations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "evaluation_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_score_summary: {
        Row: {
          commercial_score: number | null
          created_at: string | null
          esg_score: number | null
          id: string
          last_calculated_at: string | null
          overall_score: number | null
          recommendation: string | null
          reliability_score: number | null
          risk_flag: string | null
          service_score: number | null
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          commercial_score?: number | null
          created_at?: string | null
          esg_score?: number | null
          id?: string
          last_calculated_at?: string | null
          overall_score?: number | null
          recommendation?: string | null
          reliability_score?: number | null
          risk_flag?: string | null
          service_score?: number | null
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          commercial_score?: number | null
          created_at?: string | null
          esg_score?: number | null
          id?: string
          last_calculated_at?: string | null
          overall_score?: number | null
          recommendation?: string | null
          reliability_score?: number | null
          risk_flag?: string | null
          service_score?: number | null
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_score_summary_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_tiers: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          tier_name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          tier_name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          tier_name?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_blacklisted: boolean | null
          is_preferred: boolean | null
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["supplier_status"] | null
          tax_id: string | null
          tier: Database["public"]["Enums"]["supplier_tier"] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_blacklisted?: boolean | null
          is_preferred?: boolean | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["supplier_status"] | null
          tax_id?: string | null
          tier?: Database["public"]["Enums"]["supplier_tier"] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_blacklisted?: boolean | null
          is_preferred?: boolean | null
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["supplier_status"] | null
          tax_id?: string | null
          tier?: Database["public"]["Enums"]["supplier_tier"] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "procurement_officer"
        | "approver"
        | "executive"
        | "supplier"
      award_status: "pending" | "approved" | "rejected" | "revise"
      bidding_status: "scheduled" | "active" | "closed" | "cancelled"
      price_list_status: "draft" | "submitted" | "active" | "expired"
      rfq_status: "draft" | "published" | "closed" | "evaluation" | "awarded"
      supplier_status:
        | "draft"
        | "submitted"
        | "review"
        | "approved"
        | "rejected"
        | "suspended"
      supplier_tier: "critical_tier_1" | "non_critical_tier_1"
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
        "moderator",
        "user",
        "procurement_officer",
        "approver",
        "executive",
        "supplier",
      ],
      award_status: ["pending", "approved", "rejected", "revise"],
      bidding_status: ["scheduled", "active", "closed", "cancelled"],
      price_list_status: ["draft", "submitted", "active", "expired"],
      rfq_status: ["draft", "published", "closed", "evaluation", "awarded"],
      supplier_status: [
        "draft",
        "submitted",
        "review",
        "approved",
        "rejected",
        "suspended",
      ],
      supplier_tier: ["critical_tier_1", "non_critical_tier_1"],
    },
  },
} as const
