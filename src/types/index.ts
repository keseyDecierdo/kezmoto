/* =========================================================================
   KEZMOTO - Domain models
   These shapes mirror the eventual Supabase tables so swapping the mock
   service layer for real queries does not change component props.
   ========================================================================= */

export type UserRole = 'customer' | 'admin';

/** Which kind of government ID the user submitted for step 1. */
export type IdType = 'national_id' | 'drivers_license';

export const ID_TYPE_LABEL: Record<IdType, string> = {
  national_id: 'National ID',
  drivers_license: "Driver's License",
};

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  role: UserRole;
  /** Accent used for the generated avatar when no photo is set. */
  avatarColor: string;
  /** Uploaded profile photo, if any - falls back to the initials avatar. */
  avatarUrl?: string;
  memberSince: string;
  bio: string;
  /** True only once BOTH verification steps pass: the ID's printed name
      matches `name` (`idNameMatched`) AND a live face scan matches the ID
      photo (`faceVerified`) - see the `verify-id` and `face-match` Edge
      Functions, which are the only things that ever write this. */
  verified: boolean;
  facebook: string;
  /** Which ID type step 1 was submitted as, once chosen. Empty until the
      first upload. */
  idType: IdType | '';
  /** Step 1 result: true once the uploaded ID's printed name has been
      AI-matched against `name`, independent of step 2. */
  idNameMatched: boolean;
  /** Set only when a valid-ID upload's name didn't match `name`. Owner-only -
      never populated on a profile fetched for someone else (see mapProfile). */
  idVerificationNote: string;
  /** Storage path of the last uploaded valid ID, set on match or mismatch.
      Owner-only, same as idVerificationNote - only Profile.tsx ever signs
      and opens it; PublicProfile.tsx never reads this field. */
  idDocumentUrl: string;
  /** Step 2 result: true once a live selfie has been AI-matched against the
      step-1 ID photo, independent of step 1. Step 2 can't run until step 1
      (idNameMatched) has already passed. */
  faceVerified: boolean;
  /** Set only when a face-scan attempt didn't match the ID photo. Owner-only,
      same as idVerificationNote. */
  faceVerificationNote: string;
  /** Storage path of the last captured selfie. Owner-only, same as
      idDocumentUrl. */
  faceCaptureUrl: string;
  /** Set by an admin from Manage Users / User Reports. A disabled account
      can't sign in and the database rejects anything it tries to post. */
  isDisabled: boolean;
  disabledReason: string;
  /** Separate name parts from sign-up; `name` is their composed form. Empty
      for accounts created before they existed. */
  firstName: string;
  middleName: string;
  lastName: string;
  sex: Sex | '';
  /** YYYY-MM-DD. */
  birthdate: string;
  /** Picked address parts; `location` is their composed form. */
  region: string;
  province: string;
  city: string;
  barangay: string;
  /** Zone / purok / street / house no. */
  street: string;
  /** Seller Pro is active until this ISO time; '' = never bought. */
  proUntil: string;
  /** Free boosts left (2 come with each Pro purchase). */
  boostCredits: number;
  /** When the user agreed that their ID and face photos are processed for
      verification; '' = not yet (asked before the first upload). */
  biometricConsentAt: string;
}

export type Sex = 'male' | 'female';

export type ListingStatus = 'active' | 'pending' | 'sold' | 'draft';

/** Free-text condition notes captured in step 3 of the unit form. */
export interface UnitCondition {
  engineNoise: string;
  brakes: string;
  tires: string;
  lights: string;
}

/** Normalised (0–1) rectangle drawn over a document to hide private data. */
export interface RedactionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UnitDocument {
  id: string;
  label: string;
  imageUrl: string;
  redactions: RedactionBox[];
}

/** One line of the Listing Quality breakdown shown under the score. */
export interface QualityCheck {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
}

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileageKm: number;
  location: string;
  photos: string[];
  /** Average-hash of each newly uploaded photo, best-effort - not aligned by
      index to `photos` (edited/sample photos are skipped). See imageHash.ts. */
  photoHashes: string[];
  documents: UnitDocument[];
  condition: UnitCondition;
  reasonForSale: string;
  description: string;
  status: ListingStatus;
  createdAt: string;
  /** Seller opted into an admin-assisted (middleman) transaction. */
  adminAssisted: boolean;
  /** Phase 5 - set only by score-listing-quality; never client-writable (see 0012). */
  listingQualityScore: number | null;
  listingQualityBreakdown: QualityCheck[] | null;
  /** Phase 5 - set only by score-condition. */
  conditionScore: number | null;
  conditionScoreExplanation: string | null;
  /** Featured (pinned first) until this ISO time; '' = not boosted. */
  boostedUntil: string;
}

/** Draft shape produced by the multi-step Add Unit form. */
export interface ListingDraft {
  photos: string[];
  documents: UnitDocument[];
  condition: UnitCondition;
  brand: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
  price: number | null;
  reasonForSale: string;
  description: string;
  location: string;
  adminAssisted: boolean;
}

export interface WantedPost {
  id: string;
  authorId: string;
  authorName: string;
  brand: string;
  model: string;
  budgetMin: number;
  budgetMax: number;
  location: string;
  notes: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  /** Absent for system messages. Drives the "Admin" badge on a bubble. */
  senderRole?: UserRole;
  body: string;
  /** Attached photo, if any - a message can carry an image with or without body text. */
  imageUrl?: string;
  sentAt: string;
  /** System notices (e.g. middleman requested) render as a centred pill. */
  system?: boolean;
}

export interface ChatParticipant {
  id: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string;
  role: UserRole;
}

export interface ChatThread {
  id: string;
  listingId: string | null;
  listingTitle: string | null;
  listingPhoto: string | null;
  /** Current status of the linked listing - null when there is none. */
  listingStatus: ListingStatus | null;
  /** True when the signed-in viewer is the linked listing's seller. */
  isOwnListing: boolean;
  /** False for an admin-initiated outreach thread (no buyer side at all) -
   *  used to hide actions (like Request Middleman) that assume one exists. */
  hasBuyer: boolean;
  participant: ChatParticipant;
  /** The admin who joined this thread as middleman, if any - distinct from
   *  `participant` when a third party joins a buyer↔seller thread. */
  assignedAdmin?: { id: string; name: string };
  /** Every party in this thread - buyer, seller, and the admin once one has
   *  joined. `participant` only ever names "the other side of the deal",
   *  which breaks down once a middleman makes it a three-way conversation,
   *  so this is what labels each message bubble by its actual sender. */
  parties: ChatParticipant[];
  unreadCount: number;
  updatedAt: string;
  middlemanRequested: boolean;
  messages: ChatMessage[];
}

/* =========================================================================
   Phase 3 - transaction lifecycle & admin middleman tooling
   ========================================================================= */

export type TransactionStatus =
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

/** Forward order for the status tracker. `cancelled` is a side-branch, not a step. */
export const TRANSACTION_STATUS_SEQUENCE: TransactionStatus[] = [
  'inquiry',
  'negotiating',
  'middleman_assigned',
  'verified',
  'payment',
  'meetup_scheduled',
  'completed',
];

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  inquiry: 'Inquiry',
  negotiating: 'Negotiating',
  middleman_assigned: 'Middleman assigned',
  verified: 'Verified',
  inspection_scheduled: 'Inspection scheduled',
  inspection_done: 'Inspection done',
  payment: 'Payment',
  meetup_scheduled: 'Meetup scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export interface TransactionParty {
  id: string;
  name: string;
  avatarColor: string;
}

export type CommissionStatus = 'pending' | 'paid' | 'failed' | 'waived';

export interface Transaction {
  id: string;
  chatId: string | null;
  listingId: string | null;
  listingTitle: string | null;
  listingPhoto: string | null;
  buyer: TransactionParty | null;
  seller: TransactionParty | null;
  adminId: string | null;
  adminName: string | null;
  proposedPrice: number | null;
  /** Who made the pending offer - only the other party may accept it. */
  proposedBy: string | null;
  agreedPrice: number | null;
  status: TransactionStatus;
  /**
   * Phase 4 - Option B: KEZMOTO never holds the sale itself, only a
   * commission from the seller. The owed amount is always derived from
   * `agreedPrice` (see `commissionAmountFor` in paymentsService.ts) rather
   * than cached here, so it can never drift out of sync with the price;
   * the actual submitted/confirmed amount and reference number live on the
   * `payments` row instead.
   */
  commissionStatus: CommissionStatus;
  meetupAt: string | null;
  meetupLocation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationChecklist {
  transactionId: string;
  orCrReviewed: boolean;
  modelYearConfirmed: boolean;
  mileagePlausible: boolean;
  conditionMatchesListing: boolean;
  ownershipMatchesSeller: boolean;
  adminNotes: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export interface Review {
  id: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

/* =========================================================================
   Phase 4 - payment & commission (Option B: facilitated payment)
   ========================================================================= */

export type PaymentType = 'commission' | 'full_sale_facilitated';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  transactionId: string;
  payerId: string | null;
  paymentType: PaymentType;
  amount: number;
  currency: string;
  /** The GCash transaction reference the seller typed in. */
  referenceNumber: string | null;
  /** Storage path in the private payment-proofs bucket. */
  proofUrl: string | null;
  status: PaymentStatus;
  /** The admin who reviewed it - null while still pending. */
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* =========================================================================
   Phase 5 - AI chatbot, listing quality, condition score, fraud detection
   ========================================================================= */

export type FraudFlagType =
  | 'low_price'
  | 'duplicate_image'
  | 'duplicate_listing'
  | 'suspicious_text'
  | 'posting_pattern'
  | 'duplicate_posting'
  | 'admin_removed';

export type FraudFlagStatus = 'pending' | 'reviewed_ok' | 'reviewed_removed';

export const FRAUD_FLAG_LABEL: Record<FraudFlagType, string> = {
  low_price: 'Unrealistically low price',
  duplicate_image: 'Duplicate / reused photo',
  duplicate_listing: 'Duplicate listing text',
  suspicious_text: 'Suspicious description',
  posting_pattern: 'Unusual posting pattern',
  duplicate_posting: 'Same unit posted by another seller',
  admin_removed: 'Removed by an admin',
};

/** Admin-only - a seller never sees whether or why their listing was flagged. */
export interface FraudFlag {
  id: string;
  listingId: string;
  listingTitle: string | null;
  listingPhoto: string | null;
  sellerName: string | null;
  flagType: FraudFlagType;
  detail: string;
  /** The admin's own note - e.g. the reason typed when removing the listing. */
  adminNote: string | null;
  aiConfidence: number | null;
  status: FraudFlagStatus;
  createdAt: string;
}

/* =========================================================================
   Listing appeals - a seller appeals a removed listing; admins approve
   (reinstates it) or deny.
   ========================================================================= */

export type ListingAppealStatus = 'pending' | 'approved' | 'denied';

export interface ListingAppeal {
  id: string;
  listingId: string;
  listingTitle: string | null;
  listingPhoto: string | null;
  fraudFlagId: string | null;
  sellerId: string;
  sellerName: string | null;
  message: string;
  status: ListingAppealStatus;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/* =========================================================================
   User reports - a customer reports the other side of a chat; admins review
   ========================================================================= */

export type ReportReason =
  | 'scam_or_fraud'
  | 'harassment'
  | 'fake_listing'
  | 'inappropriate_content'
  | 'no_show'
  | 'other';

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  scam_or_fraud: 'Scam or fraud',
  harassment: 'Harassment or abusive language',
  fake_listing: 'Fake or misleading listing',
  inappropriate_content: 'Inappropriate content',
  no_show: 'Did not show up / backed out',
  other: 'Something else',
};

export interface ReportEvidenceLine {
  sender: string;
  text: string;
  at: string;
}

/** Admin-only - the reported user is never told who reported them. */
export interface UserReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  reportedUserDisabled: boolean;
  chatId: string | null;
  reason: ReportReason;
  details: string;
  evidence: ReportEvidenceLine[];
  status: ReportStatus;
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** A row in the admin's Manage Users list. */
export interface ManagedUser {
  user: User;
  reportCount: number;
}

export interface ChatMessageTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/** Generic async envelope used by every data-driven screen. */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}
