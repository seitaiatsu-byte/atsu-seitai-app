export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/* Hand-maintained Supabase types. visit_records has no program_name (column removed in DB). */
export type Database = {
  public: {
    Tables: {
      business_rules: {
        Row: {
          id: string;
          rule_key: string;
          rule_value: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          rule_key: string;
          rule_value: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          rule_key?: string;
          rule_value?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      appointment_reservations: {
        Row: {
          id: string;
          customer_id: string | null;
          reservation_date: string;
          start_time: string;
          end_time: string;
          clinic_name: string | null;
          memo: string | null;
          status: string;
          visit_record_id: string | null;
          entry_kind: string;
          block_title: string | null;
          staff_id: string | null;
          staff_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          reservation_date: string;
          start_time: string;
          end_time: string;
          clinic_name?: string | null;
          memo?: string | null;
          status?: string;
          visit_record_id?: string | null;
          entry_kind?: string;
          block_title?: string | null;
          staff_id?: string | null;
          staff_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          reservation_date?: string;
          start_time?: string;
          end_time?: string;
          clinic_name?: string | null;
          memo?: string | null;
          status?: string;
          visit_record_id?: string | null;
          entry_kind?: string;
          block_title?: string | null;
          staff_id?: string | null;
          staff_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      calendar_color_master: {
        Row: {
          id: string;
          name: string;
          match_text: string;
          color_key: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          match_text: string;
          color_key?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          match_text?: string;
          color_key?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          name_kana: string | null;
          /** 名簿取込で kana 列の場合など（正規列は name_kana） */
          kana: string | null;
          phone_number: string | null;
          customer_number: string | null;
          email: string | null;
          created_at: string;
          clinic_name: string | null;
          points: number | null;
          memo: string | null;
          birthday: string | null;
          birth_date: string | null;
          age: number | null;
          gender: string | null;
          address: string | null;
          prefecture: string | null;
          city: string | null;
          town: string | null;
          referral_source_id: string | null;
          referral_source: string | null;
          /** 流入 main（referral_source と併用可。外部名 main_source 列） */
          main_source: string | null;
          referral_source_2: string | null;
          referral_source_3: string | null;
          first_visit_date: string | null;
          chief_complaint: string | null;
          chief_complaint_1: string | null;
          chief_complaint_2: string | null;
          chief_complaint_3: string | null;
          /** 主訴の短縮列名（complaint_1 等。正規列は chief_complaint_* ） */
          complaint_1: string | null;
          complaint_2: string | null;
          complaint_3: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          name_kana?: string | null;
          kana?: string | null;
          phone_number?: string | null;
          customer_number?: string | null;
          email?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          points?: number | null;
          memo?: string | null;
          birthday?: string | null;
          birth_date?: string | null;
          age?: number | null;
          gender?: string | null;
          address?: string | null;
          prefecture?: string | null;
          city?: string | null;
          town?: string | null;
          referral_source_id?: string | null;
          referral_source?: string | null;
          main_source?: string | null;
          referral_source_2?: string | null;
          referral_source_3?: string | null;
          first_visit_date?: string | null;
          chief_complaint?: string | null;
          chief_complaint_1?: string | null;
          chief_complaint_2?: string | null;
          chief_complaint_3?: string | null;
          complaint_1?: string | null;
          complaint_2?: string | null;
          complaint_3?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          name_kana?: string | null;
          kana?: string | null;
          phone_number?: string | null;
          customer_number?: string | null;
          email?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          points?: number | null;
          memo?: string | null;
          birthday?: string | null;
          birth_date?: string | null;
          age?: number | null;
          gender?: string | null;
          address?: string | null;
          prefecture?: string | null;
          city?: string | null;
          town?: string | null;
          referral_source_id?: string | null;
          referral_source?: string | null;
          main_source?: string | null;
          referral_source_2?: string | null;
          referral_source_3?: string | null;
          first_visit_date?: string | null;
          chief_complaint?: string | null;
          chief_complaint_1?: string | null;
          chief_complaint_2?: string | null;
          chief_complaint_3?: string | null;
          complaint_1?: string | null;
          complaint_2?: string | null;
          complaint_3?: string | null;
        };
        Relationships: [];
      };
      program_master: {
        Row: {
          id: string;
          name: string;
          price: number;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price: number;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          price?: number;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      product_master: {
        Row: {
          id: string;
          name: string;
          price: number;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price?: number;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          price?: number;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      subscription_master: {
        Row: {
          id: string;
          name: string;
          price: number;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price?: number;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          price?: number;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      visit_records: {
        Row: {
          id: string;
          customer_id: string;
          visit_date: string;
          program_id: string | null;
          payment_method: string | null;
          amount: number;
          memo: string | null;
          created_at: string;
          clinic_name: string | null;
          staff_name: string | null;
          menu_id: string | null;
          menu_name: string | null;
          payment_detail_id: string | null;
          points_used: number | null;
          media_urls: string[] | null;
          maintenance_cost: number | null;
          visit_number: number | null;
          import_customer_name: string | null;
          import_csv_visit_count: string | null;
          import_ticket_count_raw: string | null;
          be_equivalent_count: number | null;
          import_kind_text: string | null;
        };
        Insert: {
          id?: string;
          customer_id: string;
          visit_date?: string;
          program_id?: string | null;
          payment_method?: string | null;
          amount: number;
          memo?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          staff_name?: string | null;
          menu_id?: string | null;
          menu_name?: string | null;
          payment_detail_id?: string | null;
          points_used?: number | null;
          media_urls?: string[] | null;
          maintenance_cost?: number | null;
          visit_number?: number | null;
          import_customer_name?: string | null;
          import_csv_visit_count?: string | null;
          import_ticket_count_raw?: string | null;
          be_equivalent_count?: number | null;
          import_kind_text?: string | null;
        };
        Update: {
          id?: string;
          customer_id?: string;
          visit_date?: string;
          program_id?: string | null;
          payment_method?: string | null;
          amount?: number;
          memo?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          staff_name?: string | null;
          menu_id?: string | null;
          menu_name?: string | null;
          payment_detail_id?: string | null;
          points_used?: number | null;
          media_urls?: string[] | null;
          maintenance_cost?: number | null;
          visit_number?: number | null;
          import_customer_name?: string | null;
          import_csv_visit_count?: string | null;
          import_ticket_count_raw?: string | null;
          be_equivalent_count?: number | null;
          import_kind_text?: string | null;
        };
        Relationships: [];
      };
      product_sales: {
        Row: {
          id: string;
          customer_id: string;
          sale_date: string;
          product_id: string | null;
          product_name: string | null;
          quantity: number;
          payment_method: string | null;
          amount: number;
          memo: string | null;
          created_at: string;
          clinic_name: string | null;
          staff_name: string | null;
        };
        Insert: {
          id?: string;
          customer_id: string;
          sale_date: string;
          product_id?: string | null;
          product_name?: string | null;
          quantity: number;
          payment_method?: string | null;
          amount: number;
          memo?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          staff_name?: string | null;
        };
        Update: {
          id?: string;
          customer_id?: string;
          sale_date?: string;
          product_id?: string | null;
          product_name?: string | null;
          quantity?: number;
          payment_method?: string | null;
          amount?: number;
          memo?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          staff_name?: string | null;
        };
        Relationships: [];
      };
      subscription_records: {
        Row: {
          id: string;
          customer_id: string;
          subscription_id: string | null;
          subscription_name: string | null;
          period_id: string | null;
          start_date: string;
          payment_method: string | null;
          amount: number;
          memo: string | null;
          created_at: string;
          clinic_name: string | null;
          staff_name: string | null;
        };
        Insert: {
          id?: string;
          customer_id: string;
          subscription_id?: string | null;
          subscription_name?: string | null;
          period_id?: string | null;
          start_date: string;
          payment_method?: string | null;
          amount: number;
          memo?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          staff_name?: string | null;
        };
        Update: {
          id?: string;
          customer_id?: string;
          subscription_id?: string | null;
          subscription_name?: string | null;
          period_id?: string | null;
          start_date?: string;
          payment_method?: string | null;
          amount?: number;
          memo?: string | null;
          created_at?: string;
          clinic_name?: string | null;
          staff_name?: string | null;
        };
        Relationships: [];
      };
      payment_method_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      payment_detail_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      menu_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      staff_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      referral_source_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      chief_complaint_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      main_complaint_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      period_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      clinic_master: {
        Row: {
          id: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_order: number;
          is_active: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
