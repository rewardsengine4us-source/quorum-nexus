export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          created_at: string;
        };
      };
      email_connections: {
        Row: {
          id: number;
          user_id: string;
          oauth_provider: string;
          email: string;
          access_token: string;
          refresh_token: string | null;
          linked_card_ids: number[] | null;
          linked_program_ids: number[] | null;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      email_parsing_logs: {
        Row: {
          id: number;
          user_id: string;
          email_id: string | null;
          email_subject: string | null;
          sender: string | null;
          extracted_points: number | null;
          extracted_balance: number | null;
          program_id: number | null;
          card_id: number | null;
          parse_status: string | null;
          error_message: string | null;
          raw_email_snippet: string | null;
          created_at: string;
        };
      };
    };
  };
};
