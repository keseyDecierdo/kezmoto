/* =========================================================================
   KEZMOTO — Database row shapes
   Hand-written to match supabase/migrations/0001_schema.sql. Keep the two in
   step; regenerate with `supabase gen types typescript` once the CLI is set
   up if you prefer.
   ========================================================================= */

export type DbRole = 'customer' | 'admin';
export type DbListingStatus = 'draft' | 'active' | 'under_negotiation' | 'sold' | 'removed';
export type DbChatStatus = 'active' | 'middleman_requested' | 'middleman_joined' | 'closed';
export type DbWantedStatus = 'open' | 'matched' | 'closed';
export type DbTransactionStatus =
  | 'inquiry'
  | 'negotiating'
  | 'middleman_assigned'
  | 'verified'
  | 'inspection_scheduled'
  | 'inspection_done'
  | 'payment'
  | 'meetup_scheduled'
  | 'completed'
  | 'cancelled';
export type DbPassFail = 'pass' | 'fail' | 'conditional';
export type DbCommissionPayer = 'buyer' | 'seller' | 'split';
export type DbCommissionStatus = 'pending' | 'paid' | 'failed' | 'waived';
export type DbPaymentType = 'commission' | 'full_sale_facilitated';
export type DbPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';
export type DbFraudFlagType =
  | 'low_price'
  | 'duplicate_image'
  | 'duplicate_listing'
  | 'suspicious_text'
  | 'posting_pattern'
  | 'duplicate_posting'
  | 'admin_removed';
export type DbFraudFlagStatus = 'pending' | 'reviewed_ok' | 'reviewed_removed';
export type DbListingAppealStatus = 'pending' | 'approved' | 'denied';

export type DbIdType = 'national_id' | 'drivers_license';

export type DbSex = 'male' | 'female';

export type ProfileRow = {
  profile_id: string;
  role: DbRole;
  full_name: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  address: string | null;
  verified: boolean | null;
  rating_avg: number | null;
  bio: string | null;
  facebook_url: string | null;
  id_document_url: string | null;
  id_verification_note: string | null;
  id_type: DbIdType | null;
  id_name_matched: boolean | null;
  face_verified: boolean | null;
  face_verification_note: string | null;
  face_capture_url: string | null;
  is_disabled: boolean | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  sex: DbSex | null;
  birthdate: string | null;
  region: string | null;
  province: string | null;
  city: string | null;
  barangay: string | null;
  street: string | null;
  /** Seller Pro active until then (0036). */
  pro_until: string | null;
  boost_credits: number | null;
  created_at: string;
}

export type PlanKind = 'pro' | 'boost';
export type PlanPurchaseStatus = 'pending' | 'approved' | 'rejected';

export type PlanPurchaseRow = {
  purchase_id: string;
  buyer_id: string;
  kind: PlanKind;
  listing_id: string | null;
  amount: number;
  reference_number: string;
  proof_url: string;
  status: PlanPurchaseStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type ListingRow = {
  listing_id: string;
  seller_id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number | null;
  price: number;
  location: string | null;
  reason_for_sale: string | null;
  description: string | null;
  admin_assisted: boolean | null;
  engine_status: string | null;
  brake_status: string | null;
  tire_status: string | null;
  light_status: string | null;
  photos: string[];
  photo_hashes: string[] | null;
  documents: string[] | null;
  document_blur_applied: boolean | null;
  listing_quality_score: number | null;
  listing_quality_breakdown: QualityCheckJson[] | null;
  condition_score: number | null;
  condition_score_explanation: string | null;
  status: DbListingStatus;
  /** Pinned to the top of Home / Landing until then (0036). */
  boosted_until: string | null;
  created_at: string;
}

export type QualityCheckJson = {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
};

export type WantedPostRow = {
  wanted_post_id: string;
  buyer_id: string;
  preferred_brand: string | null;
  preferred_model: string | null;
  budget_min: number | null;
  budget_max: number | null;
  location: string | null;
  notes: string | null;
  status: DbWantedStatus;
  created_at: string;
}

export type ChatRow = {
  chat_id: string;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  admin_id: string | null;
  status: DbChatStatus;
  buyer_last_read_at: string | null;
  seller_last_read_at: string | null;
  created_at: string;
}

export type MessageRow = {
  message_id: string;
  chat_id: string;
  sender_id: string | null;
  sender_role: DbRole | null;
  message_text: string | null;
  image_path: string | null;
  is_system: boolean | null;
  created_at: string;
}

export type FavoriteRow = {
  favorite_id: string;
  profile_id: string;
  listing_id: string;
  created_at: string;
}

export type DocumentRedactionRow = {
  document_redaction_id: string;
  listing_id: string;
  document_url: string;
  label: string | null;
  redaction_regions: { id: string; x: number; y: number; width: number; height: number }[];
  created_at: string;
}

export type TransactionRow = {
  transaction_id: string;
  chat_id: string | null;
  listing_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  admin_id: string | null;
  proposed_price: number | null;
  /** Who made the current offer (0034). */
  proposed_by: string | null;
  agreed_price: number | null;
  status: DbTransactionStatus;
  commission_amount: number | null;
  commission_payer: DbCommissionPayer | null;
  commission_status: DbCommissionStatus;
  payment_reference: string | null;
  meetup_at: string | null;
  meetup_location: string | null;
  created_at: string;
  updated_at: string;
}

export type VerificationChecklistRow = {
  verification_checklist_id: string;
  transaction_id: string;
  or_cr_reviewed: boolean | null;
  model_year_confirmed: boolean | null;
  mileage_plausible: boolean | null;
  condition_matches_listing: boolean | null;
  ownership_matches_seller: boolean | null;
  admin_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  disclaimer_shown: boolean | null;
}

export type ReviewRow = {
  review_id: string;
  transaction_id: string | null;
  reviewer_id: string | null;
  reviewee_id: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

export type PaymentRow = {
  payment_id: string;
  transaction_id: string | null;
  payer_id: string | null;
  payment_type: DbPaymentType | null;
  amount: number;
  currency: string | null;
  reference_number: string | null;
  proof_url: string | null;
  status: DbPaymentStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AiChatbotLogRow = {
  ai_chatbot_log_id: string;
  user_id: string | null;
  question: string | null;
  answer: string | null;
  listing_id: string | null;
  created_at: string;
}

export type DbReportReason =
  | 'scam_or_fraud'
  | 'harassment'
  | 'fake_listing'
  | 'inappropriate_content'
  | 'no_show'
  | 'other';
export type DbReportStatus = 'pending' | 'reviewed' | 'dismissed';

export type UserReportRow = {
  report_id: string;
  reporter_id: string;
  reported_user_id: string;
  chat_id: string | null;
  reason: DbReportReason;
  details: string | null;
  evidence: { sender: string; text: string; at: string }[] | null;
  status: DbReportStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type FraudFlagRow = {
  fraud_flag_id: string;
  listing_id: string | null;
  flag_type: DbFraudFlagType;
  detail: string | null;
  admin_note: string | null;
  ai_confidence: number | null;
  status: DbFraudFlagStatus;
  created_at: string;
}

export type ListingAppealRow = {
  listing_appeal_id: string;
  listing_id: string;
  fraud_flag_id: string | null;
  seller_id: string;
  message: string;
  status: DbListingAppealStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type NotificationRow = {
  notification_id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean | null;
  created_at: string;
}

/** Shape postgrest-js expects per table; `Relationships` stays empty because
    embedded selects in the services declare their foreign key explicitly. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      listings: Table<ListingRow>;
      wanted_posts: Table<WantedPostRow>;
      chats: Table<ChatRow>;
      messages: Table<MessageRow>;
      favorites: Table<FavoriteRow>;
      document_redactions: Table<DocumentRedactionRow>;
      transactions: Table<TransactionRow>;
      verification_checklist: Table<VerificationChecklistRow>;
      reviews: Table<ReviewRow>;
      payments: Table<PaymentRow>;
      ai_chatbot_logs: Table<AiChatbotLogRow>;
      fraud_flags: Table<FraudFlagRow>;
      listing_appeals: Table<ListingAppealRow>;
      user_reports: Table<UserReportRow>;
      notifications: Table<NotificationRow>;
      plan_purchases: Table<PlanPurchaseRow>;
    };
    Views: Record<string, never>;
    Functions: {
      use_boost_credit: { Args: { p_listing: string }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
