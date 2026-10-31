/* =========================================================================
   KEZMOTO — Listings
   Photos and documents are stored as bucket paths; the seller's name comes
   from an embedded profiles row; labels and redaction boxes live in
   document_redactions, one row per document.
   ========================================================================= */

import { supabase } from '../lib/supabaseClient';
import type { DocumentRedactionRow, ListingRow } from '../lib/database.types';
import type { Listing, ListingDraft, UnitDocument, User } from '../types';
import { mapListing, toDbListingStatus } from './mappers';
import type { ListingJoins } from './mappers';
import { isPendingUpload, peekPendingFile, persistAsset, persistAssets, signDocumentUrls } from './storageService';
import { settle } from './simulate';
import { averageHash } from '../utils/imageHash';

/** `select` with the seller's display name embedded. */
const LISTING_SELECT = '*, seller:profiles!listings_seller_id_fkey(full_name)';

type ListingRowWithSeller = ListingRow & { seller: { full_name: string | null } | null };

/* -------------------------------------------------------------------------
   Reads
   ------------------------------------------------------------------------- */

/** Fetches labels + redaction boxes and the signed document URLs in one go. */
const buildJoins = async (rows: ListingRowWithSeller[]): Promise<Map<string, ListingJoins>> => {
  const joins = new Map<string, ListingJoins>();
  if (rows.length === 0) return joins;

  const { data: redactionRows } = await supabase
    .from('document_redactions')
    .select('*')
    .in(
      'listing_id',
      rows.map((row) => row.listing_id)
    );

  const documentUrls = await signDocumentUrls(rows.flatMap((row) => row.documents ?? []));

  for (const row of rows) {
    const redactions = new Map<string, DocumentRedactionRow>();
    for (const redaction of (redactionRows ?? []) as DocumentRedactionRow[]) {
      if (redaction.listing_id === row.listing_id) redactions.set(redaction.document_url, redaction);
    }
    joins.set(row.listing_id, {
      sellerName: row.seller?.full_name ?? undefined,
      redactions,
      documentUrls,
    });
  }

  return joins;
};

const mapRows = async (rows: ListingRowWithSeller[]): Promise<Listing[]> => {
  const joins = await buildJoins(rows);
  return rows.map((row) => mapListing(row, joins.get(row.listing_id) ?? {}));
};

/* -------------------------------------------------------------------------
   Writes
   ------------------------------------------------------------------------- */

/**
 * Best-effort perceptual hash of each freshly picked photo (Phase 5 fraud
 * detection — see supabase/migrations/0012). Must run before `persistAssets`
 * uploads them, since that consumes the pending File via `takePendingFile`;
 * `peekPendingFile` reads without consuming. Already-stored photos (editing
 * an existing listing, sample artwork) are skipped — duplicate detection
 * only matters for genuinely new uploads.
 */
const hashNewPhotos = async (urls: string[]): Promise<string[]> => {
  const hashes: string[] = [];
  for (const url of urls) {
    if (!isPendingUpload(url)) continue;
    const file = peekPendingFile(url);
    const hash = file ? await averageHash(file) : null;
    if (hash) hashes.push(hash);
  }
  return hashes;
};

/** Uploads any freshly picked documents and keeps them paired with their label. */
const persistDocuments = async (
  documents: UnitDocument[],
  ownerId: string
): Promise<{ document: UnitDocument; storedValue: string }[]> => {
  const pairs: { document: UnitDocument; storedValue: string }[] = [];
  for (const document of documents) {
    const storedValue = await persistAsset(document.imageUrl, ownerId, 'document');
    if (storedValue) pairs.push({ document, storedValue });
  }
  return pairs;
};

/** Rewrites the metadata rows for a listing's current set of documents. */
const writeDocumentMeta = async (
  listingId: string,
  pairs: { document: UnitDocument; storedValue: string }[]
): Promise<void> => {
  const keep = pairs.map((pair) => pair.storedValue);

  // Drop the rows for documents the seller removed.
  const stale = supabase.from('document_redactions').delete().eq('listing_id', listingId);
  await (keep.length > 0 ? stale.not('document_url', 'in', `("${keep.join('","')}")`) : stale);

  if (pairs.length === 0) return;

  const { error } = await supabase.from('document_redactions').upsert(
    pairs.map((pair) => ({
      listing_id: listingId,
      document_url: pair.storedValue,
      label: pair.document.label,
      redaction_regions: pair.document.redactions,
    })),
    { onConflict: 'listing_id,document_url' }
  );
  if (error) throw new Error(`Documents saved, but their labels did not. (${error.message})`);
};

const draftColumns = (draft: Partial<Listing> | ListingDraft) => ({
  ...(draft.brand !== undefined ? { brand: draft.brand } : {}),
  ...(draft.model !== undefined ? { model: draft.model } : {}),
  ...(draft.year != null ? { year: draft.year } : {}),
  ...(draft.mileageKm != null ? { mileage: draft.mileageKm } : {}),
  ...(draft.price != null ? { price: draft.price } : {}),
  ...(draft.location !== undefined ? { location: draft.location } : {}),
  ...(draft.reasonForSale !== undefined ? { reason_for_sale: draft.reasonForSale } : {}),
  ...(draft.description !== undefined ? { description: draft.description } : {}),
  ...(draft.adminAssisted !== undefined ? { admin_assisted: draft.adminAssisted } : {}),
  ...(draft.condition
    ? {
        engine_status: draft.condition.engineNoise,
        brake_status: draft.condition.brakes,
        tire_status: draft.condition.tires,
        light_status: draft.condition.lights,
      }
    : {}),
});

/* ------------------------------------------------------------------ api */
export const listingsApi = {
  /** Everything the viewer is allowed to see, newest first. */
  async list(): Promise<Listing[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(LISTING_SELECT)
        .neq('status', 'removed')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load units. (${error.message})`);
      return mapRows((data ?? []) as unknown as ListingRowWithSeller[]);
    }, []);
  },

  /** Landing page preview — a handful of active units, nothing more. */
  async listPreview(limit = 6): Promise<Listing[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Could not load units. (${error.message})`);
      return mapRows((data ?? []) as unknown as ListingRowWithSeller[]);
    }, []);
  },

  async getById(id: string): Promise<Listing> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('listing_id', id)
        .maybeSingle();
      if (error) throw new Error(`Could not load that unit. (${error.message})`);
      if (!data) throw new Error('That unit is no longer listed.');
      const [listing] = await mapRows([data as unknown as ListingRowWithSeller]);
      return listing;
    });
  },

  async listBySeller(sellerId: string): Promise<Listing[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('seller_id', sellerId)
        .neq('status', 'removed')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load your units. (${error.message})`);
      return mapRows((data ?? []) as unknown as ListingRowWithSeller[]);
    }, []);
  },

  /**
   * The seller's own removed units — excluded from listBySeller above (and
   * from everywhere else) on purpose. Only used to let a seller see and
   * appeal a removal (see MyUnits.tsx); note the mapped `status` on these
   * rows reads as 'draft' (mapListingStatus has no 'removed' case) — callers
   * here already know every row is removed and shouldn't trust that field.
   */
  async listRemovedBySeller(sellerId: string): Promise<Listing[]> {
    return settle(async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(LISTING_SELECT)
        .eq('seller_id', sellerId)
        .eq('status', 'removed')
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Could not load your removed units. (${error.message})`);
      return mapRows((data ?? []) as unknown as ListingRowWithSeller[]);
    }, []);
  },

  /**
   * Every distinct seller_id with at least one unit still "on the system"
   * (same bar as listBySeller — anything but removed). Used by the Sellers
   * page to only list customers who have actually posted something.
   */
  async listSellerIdsWithUnits(): Promise<string[]> {
    return settle(async () => {
      const { data, error } = await supabase.from('listings').select('seller_id').neq('status', 'removed');
      if (error) throw new Error(`Could not load sellers. (${error.message})`);
      return Array.from(new Set((data ?? []).map((row) => row.seller_id)));
    }, []);
  },

  async create(draft: ListingDraft, seller: User): Promise<Listing> {
    const photoHashes = await hashNewPhotos(draft.photos);
    const photos = await persistAssets(draft.photos, seller.id, 'photo');
    const documentPairs = await persistDocuments(draft.documents, seller.id);

    const { data, error } = await supabase
      .from('listings')
      .insert({
        seller_id: seller.id,
        ...draftColumns(draft),
        year: draft.year ?? new Date().getFullYear(),
        mileage: draft.mileageKm ?? 0,
        price: draft.price ?? 0,
        photos,
        photo_hashes: photoHashes,
        documents: documentPairs.map((pair) => pair.storedValue),
        document_blur_applied: documentPairs.some((pair) => pair.document.redactions.length > 0),
        status: 'active',
      })
      .select('listing_id')
      .single();

    if (error) {
      // 42501 = a row-level-security rejection (the 0028 verified-only policy).
      throw new Error(
        error.code === '42501'
          ? 'Verify your identity in Profile & Settings before posting a unit.'
          : `Could not post the unit. (${error.message})`
      );
    }
    await writeDocumentMeta(data.listing_id, documentPairs);
    return listingsApi.getById(data.listing_id);
  },

  async update(id: string, patch: Partial<Listing>): Promise<Listing> {
    const { data: owner, error: ownerError } = await supabase
      .from('listings')
      .select('seller_id')
      .eq('listing_id', id)
      .maybeSingle();
    if (ownerError) throw new Error(`Could not save the unit. (${ownerError.message})`);
    if (!owner) throw new Error('That unit is no longer listed.');

    const columns: Partial<ListingRow> = { ...draftColumns(patch) };

    if (patch.photos) {
      // Any brand-new picks among the edit get hashed too, merged with
      // whatever the listing already had on file.
      const newHashes = await hashNewPhotos(patch.photos);
      if (newHashes.length > 0) {
        const { data: existing } = await supabase
          .from('listings')
          .select('photo_hashes')
          .eq('listing_id', id)
          .maybeSingle();
        columns.photo_hashes = [...(existing?.photo_hashes ?? []), ...newHashes];
      }
      columns.photos = await persistAssets(patch.photos, owner.seller_id, 'photo');
    }

    let documentPairs: { document: UnitDocument; storedValue: string }[] | null = null;
    if (patch.documents) {
      documentPairs = await persistDocuments(patch.documents, owner.seller_id);
      columns.documents = documentPairs.map((pair) => pair.storedValue);
      columns.document_blur_applied = documentPairs.some(
        (pair) => pair.document.redactions.length > 0
      );
    }

    if (patch.status) columns.status = toDbListingStatus(patch.status);

    const { error } = await supabase.from('listings').update(columns).eq('listing_id', id);
    if (error) throw new Error(`Could not save the unit. (${error.message})`);

    if (documentPairs) await writeDocumentMeta(id, documentPairs);
    return listingsApi.getById(id);
  },

  /**
   * Soft delete: chats and favorites still point at the row, so the unit is
   * marked removed and filtered out of every read instead of being dropped.
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('listings')
      .update({ status: 'removed' })
      .eq('listing_id', id);
    if (error) throw new Error(`Could not remove the unit. (${error.message})`);
  },
};
