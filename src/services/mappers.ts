/* =========================================================================
   KEZMOTO — Row ⇄ domain mapping
   The screens keep the Phase 1 types; this module is the only place that
   knows about column names, so the two vocabularies never leak into each
   other.
   ========================================================================= */

import type {
  ChatMessage,
  FraudFlag,
  ListingAppeal,
  UserReport,
  Listing,
  ListingStatus,
  Payment,
  Review,
  Transaction,
  TransactionParty,
  UnitDocument,
  User,
  VerificationChecklist,
  WantedPost,
} from '../types';
import type {
  DbListingStatus,
  DocumentRedactionRow,
  FraudFlagRow,
  ListingAppealRow,
  UserReportRow,
  ListingRow,
  MessageRow,
  PaymentRow,
  ProfileRow,
  ReviewRow,
  TransactionRow,
  VerificationChecklistRow,
  WantedPostRow,
} from '../lib/database.types';
import { photoUrl } from './storageService';

/* ------------------------------------------------------------ avatars */
/** Phase 1 stored an accent per user; it is derived from the id instead so
    the palette survives without a column. */
const AVATAR_COLORS = ['#ff6a00', '#0a0a0a', '#ff8c3d', '#3a3a3a', '#cc5500'];

export const avatarColorFor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

/* ------------------------------------------------------------ statuses */
const LISTING_STATUS_TO_APP: Record<DbListingStatus, ListingStatus> = {
  draft: 'draft',
  active: 'active',
  under_negotiation: 'pending',
  sold: 'sold',
  removed: 'draft', // never shown: removed units are filtered out before mapping
};

const LISTING_STATUS_TO_DB: Record<ListingStatus, DbListingStatus> = {
  draft: 'draft',
  active: 'active',
  pending: 'under_negotiation',
  sold: 'sold',
};

export const toDbListingStatus = (status: ListingStatus): DbListingStatus =>
  LISTING_STATUS_TO_DB[status];

export const mapListingStatus = (status: DbListingStatus): ListingStatus =>
  LISTING_STATUS_TO_APP[status];

/* ------------------------------------------------------------ profiles */
export const mapProfile = (row: ProfileRow, email = ''): User => ({
  id: row.profile_id,
  name: row.full_name?.trim() || 'KEZMOTO rider',
  email,
  phone: row.phone ?? '',
  location: row.address ?? '',
  role: row.role,
  avatarColor: avatarColorFor(row.profile_id),
  memberSince: (row.created_at ?? new Date().toISOString()).slice(0, 10),
  bio: row.bio ?? '',
  verified: Boolean(row.verified),
  ...(row.profile_photo_url ? { avatarUrl: row.profile_photo_url } : {}),
  facebook: row.facebook_url ?? '',
  // Deliberately mapped here (same as every other column) rather than
  // filtered by caller — usersApi.getById is the "view someone else" path
  // and the public profile page simply never reads this field, the same
  // way it never reads `email` off a User it fetched for someone else.
  idType: row.id_type ?? '',
  idNameMatched: Boolean(row.id_name_matched),
  idVerificationNote: row.id_verification_note ?? '',
  idDocumentUrl: row.id_document_url ?? '',
  faceVerified: Boolean(row.face_verified),
  faceVerificationNote: row.face_verification_note ?? '',
  faceCaptureUrl: row.face_capture_url ?? '',
  isDisabled: Boolean(row.is_disabled),
  disabledReason: row.disabled_reason ?? '',
  firstName: row.first_name ?? '',
  middleName: row.middle_name ?? '',
  lastName: row.last_name ?? '',
  sex: row.sex ?? '',
  birthdate: row.birthdate ?? '',
  region: row.region ?? '',
  province: row.province ?? '',
  city: row.city ?? '',
  barangay: row.barangay ?? '',
  street: row.street ?? '',
  proUntil: row.pro_until ?? '',
  boostCredits: row.boost_credits ?? 0,
  biometricConsentAt: row.biometric_consent_at ?? '',
});

/* ------------------------------------------------------------ listings */
export interface ListingJoins {
  sellerName?: string;
  /** Label + redactions per stored document value. */
  redactions?: Map<string, DocumentRedactionRow>;
  /** Stored document value → signed URL. Missing entries drop the document. */
  documentUrls?: Map<string, string>;
}

const mapDocuments = (row: ListingRow, joins: ListingJoins): UnitDocument[] => {
  const stored = row.documents ?? [];
  const documents: UnitDocument[] = [];

  stored.forEach((value, index) => {
    const url = joins.documentUrls?.get(value);
    if (!url) return; // no signed URL (signed-out visitor) — omit rather than render a dead image
    const meta = joins.redactions?.get(value);
    documents.push({
      id: meta?.document_redaction_id ?? `${row.listing_id}-doc-${index}`,
      label: meta?.label?.trim() || `Document ${index + 1}`,
      imageUrl: url,
      redactions: meta?.redaction_regions ?? [],
    });
  });

  return documents;
};

export const mapListing = (row: ListingRow, joins: ListingJoins = {}): Listing => ({
  id: row.listing_id,
  sellerId: row.seller_id,
  sellerName: joins.sellerName?.trim() || 'KEZMOTO seller',
  brand: row.brand,
  model: row.model,
  year: row.year,
  price: Number(row.price ?? 0),
  mileageKm: row.mileage ?? 0,
  location: row.location ?? '',
  photos: (row.photos ?? []).map(photoUrl),
  photoHashes: row.photo_hashes ?? [],
  documents: mapDocuments(row, joins),
  condition: {
    engineNoise: row.engine_status ?? '',
    brakes: row.brake_status ?? '',
    tires: row.tire_status ?? '',
    lights: row.light_status ?? '',
  },
  reasonForSale: row.reason_for_sale ?? '',
  description: row.description ?? '',
  status: LISTING_STATUS_TO_APP[row.status] ?? 'active',
  createdAt: row.created_at,
  adminAssisted: Boolean(row.admin_assisted),
  listingQualityScore: row.listing_quality_score,
  listingQualityBreakdown: row.listing_quality_breakdown,
  conditionScore: row.condition_score,
  conditionScoreExplanation: row.condition_score_explanation,
  boostedUntil: row.boosted_until ?? '',
});

/* -------------------------------------------------------- wanted posts */
export const mapWantedPost = (row: WantedPostRow, authorName?: string): WantedPost => ({
  id: row.wanted_post_id,
  authorId: row.buyer_id,
  authorName: authorName?.trim() || 'KEZMOTO buyer',
  brand: row.preferred_brand ?? '',
  model: row.preferred_model ?? '',
  budgetMin: Number(row.budget_min ?? 0),
  budgetMax: Number(row.budget_max ?? 0),
  location: row.location ?? '',
  notes: row.notes ?? '',
  createdAt: row.created_at,
});

/* ------------------------------------------------------------ messages */
export const mapMessage = (row: MessageRow): ChatMessage => ({
  id: row.message_id,
  threadId: row.chat_id,
  senderId: row.is_system ? 'system' : (row.sender_id ?? 'system'),
  ...(row.sender_role ? { senderRole: row.sender_role } : {}),
  body: row.message_text ?? '',
  ...(row.image_path ? { imageUrl: photoUrl(row.image_path) } : {}),
  sentAt: row.created_at,
  ...(row.is_system ? { system: true as const } : {}),
});

/* -------------------------------------------------------- transactions */
type PartyStub = { profile_id: string; full_name: string | null } | null;

const mapParty = (party: PartyStub): TransactionParty | null =>
  party
    ? {
        id: party.profile_id,
        name: party.full_name?.trim() || 'KEZMOTO rider',
        avatarColor: avatarColorFor(party.profile_id),
      }
    : null;

export interface TransactionJoins {
  buyer?: PartyStub;
  seller?: PartyStub;
  adminName?: string | null;
  listingTitle?: string | null;
  listingPhoto?: string | null;
}

/** The inspection stages were removed from the flow; deals already sitting in one count as verified. */
const LEGACY_INSPECTION_STATUSES = new Set(['inspection_scheduled', 'inspection_done']);

export const mapTransaction = (row: TransactionRow, joins: TransactionJoins = {}): Transaction => ({
  id: row.transaction_id,
  chatId: row.chat_id,
  listingId: row.listing_id,
  listingTitle: joins.listingTitle ?? null,
  listingPhoto: joins.listingPhoto ?? null,
  buyer: mapParty(joins.buyer ?? null),
  seller: mapParty(joins.seller ?? null),
  adminId: row.admin_id,
  adminName: joins.adminName ?? null,
  proposedPrice: row.proposed_price != null ? Number(row.proposed_price) : null,
  proposedBy: row.proposed_by ?? null,
  agreedPrice: row.agreed_price != null ? Number(row.agreed_price) : null,
  status: LEGACY_INSPECTION_STATUSES.has(row.status) ? 'verified' : row.status,
  commissionStatus: row.commission_status,
  meetupAt: row.meetup_at,
  meetupLocation: row.meetup_location,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* --------------------------------------------------- verification */
export const mapVerificationChecklist = (row: VerificationChecklistRow): VerificationChecklist => ({
  transactionId: row.transaction_id,
  orCrReviewed: Boolean(row.or_cr_reviewed),
  modelYearConfirmed: Boolean(row.model_year_confirmed),
  mileagePlausible: Boolean(row.mileage_plausible),
  conditionMatchesListing: Boolean(row.condition_matches_listing),
  ownershipMatchesSeller: Boolean(row.ownership_matches_seller),
  adminNotes: row.admin_notes ?? '',
  verifiedBy: row.verified_by,
  verifiedAt: row.verified_at,
});

export const mapReview = (row: ReviewRow): Review => ({
  id: row.review_id,
  transactionId: row.transaction_id ?? '',
  reviewerId: row.reviewer_id ?? '',
  revieweeId: row.reviewee_id ?? '',
  rating: row.rating ?? 0,
  comment: row.comment ?? '',
  createdAt: row.created_at,
});

/* ------------------------------------------------------------- payments */
export const mapPayment = (row: PaymentRow): Payment => ({
  id: row.payment_id,
  transactionId: row.transaction_id ?? '',
  payerId: row.payer_id,
  paymentType: row.payment_type ?? 'commission',
  amount: Number(row.amount ?? 0),
  currency: row.currency ?? 'PHP',
  referenceNumber: row.reference_number,
  proofUrl: row.proof_url,
  status: row.status,
  confirmedBy: row.confirmed_by,
  confirmedAt: row.confirmed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/* ---------------------------------------------------------- fraud flags */
export interface FraudFlagJoins {
  listingTitle?: string | null;
  listingPhoto?: string | null;
  sellerName?: string | null;
}

export const mapFraudFlag = (row: FraudFlagRow, joins: FraudFlagJoins = {}): FraudFlag => ({
  id: row.fraud_flag_id,
  listingId: row.listing_id ?? '',
  listingTitle: joins.listingTitle ?? null,
  listingPhoto: joins.listingPhoto ?? null,
  sellerName: joins.sellerName ?? null,
  flagType: row.flag_type,
  detail: row.detail ?? '',
  adminNote: row.admin_note,
  aiConfidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
  status: row.status,
  createdAt: row.created_at,
});

/* -------------------------------------------------------- listing appeals */
export interface ListingAppealJoins {
  listingTitle?: string | null;
  listingPhoto?: string | null;
  sellerName?: string | null;
}

export const mapListingAppeal = (
  row: ListingAppealRow,
  joins: ListingAppealJoins = {}
): ListingAppeal => ({
  id: row.listing_appeal_id,
  listingId: row.listing_id,
  listingTitle: joins.listingTitle ?? null,
  listingPhoto: joins.listingPhoto ?? null,
  fraudFlagId: row.fraud_flag_id,
  sellerId: row.seller_id,
  sellerName: joins.sellerName ?? null,
  message: row.message,
  status: row.status,
  adminNote: row.admin_note,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
});

/* -------------------------------------------------------- user reports */
export interface UserReportJoins {
  reporterName?: string | null;
  reportedUserName?: string | null;
  reportedUserDisabled?: boolean;
}

export const mapUserReport = (row: UserReportRow, joins: UserReportJoins = {}): UserReport => ({
  id: row.report_id,
  reporterId: row.reporter_id,
  reporterName: joins.reporterName?.trim() || 'KEZMOTO rider',
  reportedUserId: row.reported_user_id,
  reportedUserName: joins.reportedUserName?.trim() || 'KEZMOTO rider',
  reportedUserDisabled: Boolean(joins.reportedUserDisabled),
  chatId: row.chat_id,
  reason: row.reason,
  details: row.details ?? '',
  evidence: row.evidence ?? [],
  status: row.status,
  adminNote: row.admin_note ?? '',
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at,
});
