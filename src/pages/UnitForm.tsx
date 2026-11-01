import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonButton,
  IonIcon,
  IonInput,
  IonSpinner,
  IonTextarea,
  IonToggle,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import {
  addOutline,
  checkmarkCircle,
  chevronBackOutline,
  chevronForwardOutline,
  cloudUploadOutline,
  diamondOutline,
  trashOutline,
} from 'ionicons/icons';
import AppPage from '../components/AppPage';
import RedactionCanvas from '../components/RedactionCanvas';
import { ErrorState, LoadingState } from '../components/StateViews';
import { useAuth } from '../context/AuthContext';
import { useMarketplace } from '../context/MarketplaceContext';
import { aiApi, listingsApi } from '../services/api';
import LocationPicker from '../components/LocationPicker';
import { rememberFile } from '../services/storageService';
import type { ListingDraft, RedactionBox, UnitDocument } from '../types';
import { EMOJIS } from '../utils/emojis';
import { FREE_LISTING_LIMIT, commissionRateFor, freeSlotsLeft, isPro } from '../utils/plans';
import './UnitForm.css';

const MIN_PHOTOS = 5;
const MIN_DOCUMENTS = 2;

const STEPS = [
  { id: 1, label: 'Photos' },
  { id: 2, label: 'Documents' },
  { id: 3, label: 'Condition' },
  { id: 4, label: 'Pricing' },
  { id: 5, label: 'Location' },
];

const EMPTY_DRAFT: ListingDraft = {
  photos: [],
  documents: [],
  condition: { engineNoise: '', brakes: '', tires: '', lights: '' },
  brand: '',
  model: '',
  year: null,
  mileageKm: null,
  price: null,
  reasonForSale: '',
  description: '',
  location: '',
  adminAssisted: false,
};

/**
 * Five-step Add / Manage Unit flow, shared by Customer and Admin.
 * Step 2 carries the click-and-drag redaction tool; redactions are kept as an
 * overlay on the draft until document storage exists.
 */
const UnitForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const router = useIonRouter();
  const { user } = useAuth();
  const { invalidate } = useMarketplace();
  const [present] = useIonToast();

  const isEdit = Boolean(id);
  const [draft, setDraft] = useState<ListingDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  // Free sellers can have FREE_LISTING_LIMIT open listings (the database
  // enforces it too); checked up front so nobody fills the form for nothing.
  const [atLimit, setAtLimit] = useState(false);
  const unlimited = isPro(user) || user?.role === 'admin';

  useEffect(() => {
    if (isEdit || !user || unlimited) {
      setAtLimit(false);
      return;
    }
    let ignore = false;
    void listingsApi
      .listBySeller(user.id)
      .then((mine) => {
        const open = mine.filter((l) => l.status === 'active' || l.status === 'pending').length;
        if (!ignore) setAtLimit(freeSlotsLeft(open, false) === 0);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [isEdit, user, unlimited]);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLIonTextareaElement>(null);
  const objectUrls = useRef<string[]>([]);

  // Prefill when managing an existing unit.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    listingsApi
      .getById(id)
      .then((listing) => {
        if (cancelled) return;
        setDraft({
          photos: listing.photos,
          documents: listing.documents,
          condition: listing.condition,
          brand: listing.brand,
          model: listing.model,
          year: listing.year,
          mileageKm: listing.mileageKm,
          price: listing.price,
          reasonForSale: listing.reasonForSale,
          description: listing.description,
          location: listing.location,
          adminAssisted: listing.adminAssisted,
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load that unit.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Release any object URLs created from local file picks.
  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  const patch = (values: Partial<ListingDraft>) => setDraft((prev) => ({ ...prev, ...values }));

  /* Nested updates go through the functional form so back-to-back edits
     (fast typing, autofill, multiple file picks) never read a stale draft. */
  const patchCondition = (key: keyof ListingDraft['condition'], value: string) =>
    setDraft((prev) => ({ ...prev, condition: { ...prev.condition, [key]: value } }));

  const patchPhotos = (update: (photos: string[]) => string[]) =>
    setDraft((prev) => ({ ...prev, photos: update(prev.photos) }));

  const patchDocuments = (update: (documents: UnitDocument[]) => UnitDocument[]) =>
    setDraft((prev) => ({ ...prev, documents: update(prev.documents) }));

  /* Splices at the current cursor position when the native textarea is
     reachable, otherwise appends at the end — either way the cursor lands
     just past the inserted emoji so a seller can keep typing. */
  const insertEmoji = async (emoji: string) => {
    const textarea = await descriptionRef.current?.getInputElement().catch(() => undefined);
    const current = draft.description;
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + emoji + current.slice(end);
    patch({ description: next });

    const cursor = start + emoji.length;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  /* ----------------------------- validation ----------------------------- */
  const stepErrors = useMemo(() => {
    const errors: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    if (draft.photos.length < MIN_PHOTOS) {
      errors[1].push(`Add at least ${MIN_PHOTOS} photos (${draft.photos.length} so far).`);
    }

    if (draft.documents.length < MIN_DOCUMENTS) {
      errors[2].push(`Attach at least ${MIN_DOCUMENTS} documents (${draft.documents.length} so far).`);
    }
    if (draft.documents.some((d) => !d.label.trim())) {
      errors[2].push('Every document needs a label.');
    }

    if (!draft.condition.engineNoise.trim()) errors[3].push('Describe the engine noise.');
    if (!draft.condition.brakes.trim()) errors[3].push('Describe the brake condition.');
    if (!draft.condition.tires.trim()) errors[3].push('Describe the tire condition.');
    if (!draft.condition.lights.trim()) errors[3].push('Describe the lights.');

    if (!draft.brand.trim()) errors[4].push('Enter the brand.');
    if (!draft.model.trim()) errors[4].push('Enter the model.');
    if (!draft.year || draft.year < 1970 || draft.year > new Date().getFullYear() + 1) {
      errors[4].push('Enter a valid year model.');
    }
    if (draft.mileageKm === null || draft.mileageKm < 0) errors[4].push('Enter the mileage in km.');
    if (!draft.price || draft.price <= 0) errors[4].push('Enter an asking price.');
    if (!draft.reasonForSale.trim()) errors[4].push('Add your reason for selling.');

    if (!draft.location.trim()) errors[5].push('Enter the unit location.');

    return errors;
  }, [draft]);

  const currentErrors = stepErrors[step] ?? [];
  const allValid = Object.values(stepErrors).every((list) => list.length === 0);
  const completed = (n: number) => (stepErrors[n] ?? []).length === 0;

  /* ------------------------------- photos ------------------------------- */
  const addPhotos = (urls: string[]) => patchPhotos((photos) => [...photos, ...urls]);

  /* The object URL renders the pick instantly; the file itself is parked in
     the storage service under that URL and uploaded on save. */
  const onPickPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const urls = files.map((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      rememberFile(url, file);
      return url;
    });
    addPhotos(urls);
    event.target.value = '';
  };

  /* ------------------------------ documents ----------------------------- */
  const onPickDocuments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const docs: UnitDocument[] = files.map((file, i) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      rememberFile(url, file);
      return {
        id: `d-${Date.now().toString(36)}-${i}`,
        label: file.name.replace(/\.[^.]+$/, ''),
        imageUrl: url,
        redactions: [],
      };
    });
    patchDocuments((documents) => [...documents, ...docs]);
    event.target.value = '';
  };

  const updateDocument = (docId: string, values: Partial<UnitDocument>) =>
    patchDocuments((documents) =>
      documents.map((doc) => (doc.id === docId ? { ...doc, ...values } : doc))
    );

  const setRedactions = (docId: string, redactions: RedactionBox[]) =>
    updateDocument(docId, { redactions });

  /* ------------------------------- submit ------------------------------- */
  const goNext = () => {
    setShowErrors(true);
    if (currentErrors.length > 0) return;
    setShowErrors(false);
    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  const goBack = () => {
    setShowErrors(false);
    setStep((s) => Math.max(1, s - 1));
  };

  const submit = async () => {
    setShowErrors(true);
    if (!allValid || !user) return;
    setSubmitting(true);
    try {
      const saved = isEdit && id
        ? await listingsApi.update(id, {
            ...draft,
            year: draft.year ?? new Date().getFullYear(),
            mileageKm: draft.mileageKm ?? 0,
            price: draft.price ?? 0,
          })
        : await listingsApi.create(draft, user);

      if (!isEdit) {
        // Fire and forget — the listing is already live; scores/fraud checks
        // fill in over the next few seconds and the badges show "Scoring…"
        // until they land (see ScoreBadges.tsx). Nothing here should ever
        // block posting the unit or navigating away. All of KEZMOTO's AI
        // features share one rate-limited Gemini key, so the fraud check
        // (admin-only, never shown to the seller) is sequenced after the two
        // visible scores instead of racing them for the same quota window.
        const visibleScores = Promise.allSettled([
          aiApi.scoreListingQuality(saved.id),
          aiApi.scoreCondition(saved.id),
        ]);
        void visibleScores.then(() => aiApi.checkFraud(saved.id).catch(() => undefined));
      }

      invalidate();
      await present({
        message: isEdit ? 'Unit updated.' : 'Unit listed. Buyers can message you now.',
        duration: 2200,
        color: 'success',
        position: 'top',
      });
      router.push(`/listing/${saved.id}`, 'forward', 'replace');
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not save the unit.',
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppPage title={isEdit ? 'Manage unit' : 'List a unit'} backHref="/units">
        <LoadingState label="Loading unit" />
      </AppPage>
    );
  }

  if (loadError) {
    return (
      <AppPage title="Manage unit" backHref="/units">
        <ErrorState message={loadError} onRetry={() => router.push('/units', 'back')} />
      </AppPage>
    );
  }

  if (atLimit) {
    return (
      <AppPage title="List a unit" backHref="/units">
        <div className="kez-bento">
          <section className="kez-tile kez-tile--full unit-form__limit">
            <IonIcon icon={diamondOutline} aria-hidden="true" />
            <h2 className="kez-display">You have {FREE_LISTING_LIMIT} active listings</h2>
            <p className="kez-muted">
              Free accounts can keep {FREE_LISTING_LIMIT} units up at a time. Mark one as sold to post another,
              or get KEZMOTO Pro for unlimited listings, a 3% commission and 2 free Boosts.
            </p>
            <div className="unit-form__limit-actions">
              <IonButton fill="outline" onClick={() => router.push('/units', 'back')}>
                Manage my units
              </IonButton>
              <IonButton className="kez-cta" onClick={() => router.push('/plans', 'forward')}>
                See KEZMOTO Pro
              </IonButton>
            </div>
          </section>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      title={isEdit ? 'Manage unit' : 'List a unit'}
      backHref={isEdit ? '/units' : '/home'}
      className="unit-form-page"
    >
      <div className="kez-bento kez-bento--start unit-form__bento">
        {/* ----------------------------- stepper ----------------------------- */}
        <ol className="kez-tile kez-tile--full stepper" aria-label="Form steps">
          {STEPS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`stepper__item${step === s.id ? ' is-current' : ''}${
                  completed(s.id) ? ' is-done' : ''
                }`}
                onClick={() => setStep(s.id)}
              >
                <span className="stepper__dot">
                  {completed(s.id) ? <IonIcon icon={checkmarkCircle} /> : s.id}
                </span>
                <span className="stepper__label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="kez-tile kez-tile--w3 unit-form">
          {/* ------------------------- Step 1: photos ------------------------- */}
          {step === 1 && (
            <section className="unit-form__step">
              <header className="unit-form__step-head">
                <p className="kez-eyebrow">Step 1 of 5</p>
                <h2 className="kez-display">Photos</h2>
                <p className="kez-muted">
                  At least {MIN_PHOTOS} photos. Show both sides, the odometer, the engine and any
                  damage you mention in the condition notes.
                </p>
              </header>

              <div className="unit-form__counter">
                <div className="unit-form__progress">
                  <span
                    style={{ width: `${Math.min(100, (draft.photos.length / MIN_PHOTOS) * 100)}%` }}
                  />
                </div>
                <span className={draft.photos.length >= MIN_PHOTOS ? 'is-ok' : undefined}>
                  {draft.photos.length} / {MIN_PHOTOS} minimum
                </span>
              </div>

              <div className="unit-form__thumbs">
                {draft.photos.map((photo, index) => (
                  <figure className="unit-form__thumb" key={`${photo}-${index}`}>
                    <img src={photo} alt={`Unit photo ${index + 1}`} />
                    <button
                      type="button"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() => patchPhotos((photos) => photos.filter((_, i) => i !== index))}
                    >
                      <IonIcon icon={trashOutline} />
                    </button>
                    {index === 0 && <figcaption>Cover</figcaption>}
                  </figure>
                ))}

                <button
                  type="button"
                  className="unit-form__dropzone"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <IonIcon icon={cloudUploadOutline} />
                  <span>Upload photos</span>
                  <small>JPG or PNG from this device</small>
                </button>
              </div>

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPickPhotos}
              />
            </section>
          )}

          {/* ------------------------ Step 2: documents ----------------------- */}
          {step === 2 && (
            <section className="unit-form__step">
              <header className="unit-form__step-head">
                <p className="kez-eyebrow">Step 2 of 5</p>
                <h2 className="kez-display">Documents</h2>
                <p className="kez-muted">
                  At least {MIN_DOCUMENTS} documents — usually the OR and CR. Drag across the image to
                  black out plate numbers, names, addresses and engine numbers before posting.
                </p>
              </header>

              <div className="unit-form__counter">
                <div className="unit-form__progress">
                  <span
                    style={{
                      width: `${Math.min(100, (draft.documents.length / MIN_DOCUMENTS) * 100)}%`,
                    }}
                  />
                </div>
                <span className={draft.documents.length >= MIN_DOCUMENTS ? 'is-ok' : undefined}>
                  {draft.documents.length} / {MIN_DOCUMENTS} minimum
                </span>
              </div>

              <div className="unit-form__docs">
                {draft.documents.map((doc) => (
                  <article className="unit-form__doc" key={doc.id}>
                    <div className="unit-form__doc-head">
                      <IonInput
                        className="kez-field unit-form__doc-label"
                        label="Document label"
                        labelPlacement="stacked"
                        value={doc.label}
                        placeholder="e.g. Official Receipt (OR)"
                        onIonInput={(e) =>
                          updateDocument(doc.id, { label: String(e.detail.value ?? '') })
                        }
                      />
                      <IonButton
                        fill="clear"
                        color="danger"
                        size="small"
                        onClick={() =>
                          patchDocuments((documents) => documents.filter((d) => d.id !== doc.id))
                        }
                      >
                        <IonIcon slot="icon-only" icon={trashOutline} />
                      </IonButton>
                    </div>

                    <RedactionCanvas
                      imageUrl={doc.imageUrl}
                      label={doc.label || 'Document'}
                      redactions={doc.redactions}
                      onChange={(next) => setRedactions(doc.id, next)}
                    />
                  </article>
                ))}
              </div>

              <input
                ref={docInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPickDocuments}
              />

              <div className="unit-form__doc-actions">
                <IonButton fill="outline" color="primary" size="small" onClick={() => docInputRef.current?.click()}>
                  <IonIcon slot="start" icon={cloudUploadOutline} />
                  Upload document
                </IonButton>
              </div>
            </section>
          )}

          {/* ------------------------ Step 3: condition ----------------------- */}
          {step === 3 && (
            <section className="unit-form__step">
              <header className="unit-form__step-head">
                <p className="kez-eyebrow">Step 3 of 5</p>
                <h2 className="kez-display">Condition</h2>
                <p className="kez-muted">
                  Be specific. Buyers trust listings that mention the flaws, and it saves you repeat
                  questions in chat.
                </p>
              </header>

              {(
                [
                  ['engineNoise', 'Engine noise', 'e.g. Smooth idle, slight tick when cold'],
                  ['brakes', 'Brakes', 'e.g. Front pads replaced last month, rear at 50%'],
                  ['tires', 'Tires', 'e.g. Rear replaced Jan 2026, front at 60%'],
                  ['lights', 'Lights', 'e.g. All stock and working, LED headlight upgrade'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <IonTextarea
                  key={key}
                  className="kez-field"
                  label={label}
                  labelPlacement="stacked"
                  placeholder={placeholder}
                  autoGrow
                  rows={2}
                  value={draft.condition[key]}
                  onIonInput={(e) => patchCondition(key, String(e.detail.value ?? ''))}
                />
              ))}
            </section>
          )}

          {/* ------------------------- Step 4: pricing ------------------------ */}
          {step === 4 && (
            <section className="unit-form__step">
              <header className="unit-form__step-head">
                <p className="kez-eyebrow">Step 4 of 5</p>
                <h2 className="kez-display">Mileage, price & reason</h2>
                <p className="kez-muted">The numbers buyers filter on, plus why you are letting it go.</p>
              </header>

              <div className="unit-form__row">
                <IonInput
                  className="kez-field"
                  label="Brand"
                  labelPlacement="stacked"
                  placeholder="Yamaha"
                  value={draft.brand}
                  onIonInput={(e) => patch({ brand: String(e.detail.value ?? '') })}
                />
                <IonInput
                  className="kez-field"
                  label="Model"
                  labelPlacement="stacked"
                  placeholder="YZF-R15 V3"
                  value={draft.model}
                  onIonInput={(e) => patch({ model: String(e.detail.value ?? '') })}
                />
              </div>

              <div className="unit-form__row">
                <IonInput
                  className="kez-field"
                  type="number"
                  label="Year model"
                  labelPlacement="stacked"
                  placeholder="2021"
                  value={draft.year ?? ''}
                  onIonInput={(e) =>
                    patch({ year: e.detail.value ? Number(e.detail.value) : null })
                  }
                />
                <IonInput
                  className="kez-field"
                  type="number"
                  label="Mileage (km)"
                  labelPlacement="stacked"
                  placeholder="14200"
                  value={draft.mileageKm ?? ''}
                  onIonInput={(e) =>
                    patch({ mileageKm: e.detail.value ? Number(e.detail.value) : null })
                  }
                />
              </div>

              <IonInput
                className="kez-field"
                type="number"
                label="Asking price (PHP)"
                labelPlacement="stacked"
                placeholder="92000"
                value={draft.price ?? ''}
                onIonInput={(e) => patch({ price: e.detail.value ? Number(e.detail.value) : null })}
              />

              <IonTextarea
                className="kez-field"
                label="Reason for sale"
                labelPlacement="stacked"
                placeholder="e.g. Upgrading to a bigger displacement unit"
                autoGrow
                rows={2}
                value={draft.reasonForSale}
                onIonInput={(e) => patch({ reasonForSale: String(e.detail.value ?? '') })}
              />

              <IonTextarea
                ref={descriptionRef}
                className="kez-field"
                label="Description (optional)"
                labelPlacement="stacked"
                placeholder="Service history, upgrades, what is included in the sale"
                autoGrow
                rows={3}
                value={draft.description}
                onIonInput={(e) => patch({ description: String(e.detail.value ?? '') })}
              />
              <div className="unit-form__emoji-row" role="group" aria-label="Insert emoji">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => void insertEmoji(emoji)}
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <label className="unit-form__toggle">
                <span>
                  <strong>Open to admin-assisted deals</strong>
                  <small>Shows an “Assisted” badge and lets buyers request a middleman.</small>
                </span>
                <IonToggle
                  checked={draft.adminAssisted}
                  onIonChange={(e) => patch({ adminAssisted: e.detail.checked })}
                />
              </label>
            </section>
          )}

          {/* ------------------------- Step 5: location ----------------------- */}
          {step === 5 && (
            <section className="unit-form__step">
              <header className="unit-form__step-head">
                <p className="kez-eyebrow">Step 5 of 5</p>
                <h2 className="kez-display">Location</h2>
                <p className="kez-muted">
                  Where can buyers view the unit? City level is enough — exact meet-ups are arranged in
                  chat.
                </p>
              </header>

              <LocationPicker
                value={isEdit ? draft.location : undefined}
                onChange={(location) => patch({ location })}
              />

              <div className="unit-form__review">
                <h3 className="kez-display">Ready to post</h3>
                <ul>
                  {STEPS.map((s) => (
                    <li key={s.id} className={completed(s.id) ? 'is-ok' : 'is-missing'}>
                      <IonIcon icon={completed(s.id) ? checkmarkCircle : addOutline} />
                      <span>{s.label}</span>
                      <em>{completed(s.id) ? 'Complete' : (stepErrors[s.id] ?? [])[0]}</em>
                    </li>
                  ))}
                </ul>
                <p className="unit-form__fee">
                  Posting is free. When this unit sells, KEZMOTO charges a{' '}
                  <strong>{Math.round(commissionRateFor(isPro(user)) * 100)}% commission</strong> on the final
                  agreed price, paid by GCash. No other fees.{' '}
                  <a href="/terms" target="_blank" rel="noopener">
                    Terms
                  </a>
                </p>
              </div>
            </section>
          )}

          {/* ---------------------------- validation --------------------------- */}
          {showErrors && currentErrors.length > 0 && (
            <div className="unit-form__errors" role="alert">
              {currentErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          {/* ------------------------------ actions ---------------------------- */}
          <div className="unit-form__actions">
            <IonButton fill="outline" color="medium" disabled={step === 1} onClick={goBack}>
              <IonIcon slot="start" icon={chevronBackOutline} />
              Back
            </IonButton>

            {step < STEPS.length ? (
              <IonButton className="kez-cta" onClick={goNext}>
                Next
                <IonIcon slot="end" icon={chevronForwardOutline} />
              </IonButton>
            ) : (
              <IonButton className="kez-cta" onClick={submit} disabled={submitting}>
                {submitting ? <IonSpinner name="crescent" /> : isEdit ? 'Save changes' : 'Post unit'}
              </IonButton>
            )}
          </div>
        </div>

        {/* Progress summary beside the form — wide desktops only. */}
        <aside className="kez-tile kez-tile--soft unit-form__progress-tile" aria-label="Progress">
          <p className="kez-stat__label">Progress</p>
          <p className="kez-stat__value">
            {STEPS.filter((s) => completed(s.id)).length}/{STEPS.length}
          </p>
          <ul className="unit-form__progress-list">
            {STEPS.map((s) => (
              <li key={s.id} className={completed(s.id) ? 'is-done' : step === s.id ? 'is-current' : ''}>
                <IonIcon icon={checkmarkCircle} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </AppPage>
  );
};

export default UnitForm;
