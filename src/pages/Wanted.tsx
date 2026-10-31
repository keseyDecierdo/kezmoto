import React, { useMemo, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
} from '@ionic/react';
import {
  addCircleOutline,
  chatbubbleEllipsesOutline,
  closeOutline,
  locationOutline,
  megaphoneOutline,
  trashOutline,
  walletOutline,
} from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import LocationPicker from '../components/LocationPicker';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useMarketplace } from '../context/MarketplaceContext';
import { confirmAction } from '../lib/sweetAlert';
import { wantedApi } from '../services/api';
import type { WantedPost } from '../types';
import { formatPriceRange, formatRelative } from '../utils/format';
import './Wanted.css';

interface WantedForm {
  brand: string;
  model: string;
  budgetMin: string;
  budgetMax: string;
  location: string;
  notes: string;
}

const EMPTY_FORM: WantedForm = {
  brand: '',
  model: '',
  budgetMin: '',
  budgetMax: '',
  location: '',
  notes: '',
};

/** Browse Wanted posts and publish your own. */
const Wanted: React.FC = () => {
  const { user } = useAuth();
  const router = useIonRouter();
  const { startThreadForWantedPost } = useMarketplace();
  const [present] = useIonToast();
  const [nonce, setNonce] = useState(0);
  const { data, loading, error, reload } = useAsync<WantedPost[]>(() => wantedApi.list(), [nonce]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<WantedForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof WantedForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const posts = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [data]
  );

  const set = (key: keyof WantedForm) => (event: CustomEvent) =>
    setForm((prev) => ({ ...prev, [key]: String(event.detail.value ?? '') }));

  const validate = () => {
    const next: Partial<Record<keyof WantedForm, string>> = {};
    const min = Number(form.budgetMin);
    const max = Number(form.budgetMax);
    if (!form.brand.trim()) next.brand = 'Enter a preferred brand.';
    if (!form.model.trim()) next.model = 'Enter a preferred model.';
    if (!form.budgetMin || min <= 0) next.budgetMin = 'Enter a minimum budget.';
    if (!form.budgetMax || max <= 0) next.budgetMax = 'Enter a maximum budget.';
    if (min > 0 && max > 0 && max < min) next.budgetMax = 'Maximum must be higher than minimum.';
    if (!form.location.trim()) next.location = 'Pick at least your region, province and city.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate() || !user) return;
    setSaving(true);
    try {
      await wantedApi.create(
        {
          brand: form.brand.trim(),
          model: form.model.trim(),
          budgetMin: Number(form.budgetMin),
          budgetMax: Number(form.budgetMax),
          location: form.location.trim(),
          notes: form.notes.trim(),
        },
        user
      );
      setOpen(false);
      setForm(EMPTY_FORM);
      setNonce((n) => n + 1);
      await present({ message: 'Wanted post published.', duration: 2000, color: 'success', position: 'top' });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not publish the post.',
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSaving(false);
    }
  };

  const messageAuthor = async (post: WantedPost) => {
    try {
      const thread = await startThreadForWantedPost(post);
      router.push(`/chat/${thread.id}`, 'forward');
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not open that conversation.',
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
    }
  };

  const deletePost = (post: WantedPost) =>
    confirmAction({
      title: 'Delete this post?',
      text: `Your ${post.brand} ${post.model} wanted post will no longer be visible to sellers.`,
      confirmText: 'Delete',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      void wantedApi.delete(post.id).then(() => {
        setNonce((n) => n + 1);
        void present({ message: 'Post deleted.', duration: 1800, position: 'top' });
      });
    });

  return (
    <AppPage
      title="Wanted"
      eyebrow="Looking for a unit"
      actions={
        <IonButton onClick={() => setOpen(true)} aria-label="Post a wanted ad">
          <IonIcon slot="icon-only" icon={addCircleOutline} />
        </IonButton>
      }
    >
      <header className="kez-tile kez-tile--hero wanted__head">
        <div>
          <h1 className="kez-display">Wanted posts</h1>
          <p className="kez-muted">
            Cannot find the unit you want? Post what you are looking for and let sellers come to you.
          </p>
        </div>
        <IonButton className="kez-cta wanted__cta" onClick={() => setOpen(true)}>
          <IonIcon slot="start" icon={megaphoneOutline} />
          Post a wanted ad
        </IonButton>
      </header>

      {loading && <LoadingRows rows={4} />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && posts.length === 0 && (
        <EmptyState
          icon={megaphoneOutline}
          title="No wanted posts yet"
          message="Be the first to describe the unit you are hunting for, with your budget and location."
          actionLabel="Post a wanted ad"
          onAction={() => setOpen(true)}
        />
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="kez-bento kez-bento--cards wanted__list">
          {posts.map((post) => (
            <article className="kez-tile wanted__card" key={post.id}>
              <header className="wanted__card-head">
                <Avatar name={post.authorName} size="sm" />
                <div>
                  <strong>{post.authorName}</strong>
                  <span>{formatRelative(post.createdAt)}</span>
                </div>
                {post.authorId === user?.id && <span className="kez-chip kez-chip--accent">Your post</span>}
              </header>

              <h3 className="kez-display">
                {post.brand} {post.model}
              </h3>

              <ul className="wanted__meta">
                <li>
                  <IonIcon icon={walletOutline} />
                  {formatPriceRange(post.budgetMin, post.budgetMax)}
                </li>
                <li>
                  <IonIcon icon={locationOutline} />
                  {post.location}
                </li>
              </ul>

              {post.notes && <p className="kez-body wanted__notes">{post.notes}</p>}

              <div className="wanted__card-actions">
                {post.authorId === user?.id ? (
                  <IonButton
                    fill="outline"
                    color="danger"
                    size="small"
                    onClick={() => void deletePost(post)}
                  >
                    <IonIcon slot="start" icon={trashOutline} />
                    Delete
                  </IonButton>
                ) : (
                  <IonButton
                    className="kez-cta"
                    size="small"
                    onClick={() => void messageAuthor(post)}
                  >
                    <IonIcon slot="start" icon={chatbubbleEllipsesOutline} />
                    Send Message
                  </IonButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ------------------------- Create modal ------------------------- */}
      <IonModal
        isOpen={open}
        onDidDismiss={() => setOpen(false)}
        className="kez-modal kez-modal--wide wanted__modal"
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Post a wanted ad</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setOpen(false)} aria-label="Close">
                <IonIcon slot="icon-only" icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <div className="kez-modal__body">
          <form onSubmit={submit} noValidate className="wanted__form">
            <div className="wanted__form-row">
              <div>
                <IonInput
                  className="kez-field"
                  label="Preferred brand"
                  labelPlacement="stacked"
                  placeholder="Honda"
                  value={form.brand}
                  onIonInput={set('brand')}
                />
                {errors.brand && <p className="kez-form-error">{errors.brand}</p>}
              </div>
              <div>
                <IonInput
                  className="kez-field"
                  label="Preferred model"
                  labelPlacement="stacked"
                  placeholder="Click 125i or 160i"
                  value={form.model}
                  onIonInput={set('model')}
                />
                {errors.model && <p className="kez-form-error">{errors.model}</p>}
              </div>
            </div>

            <div className="wanted__form-row">
              <div>
                <IonInput
                  className="kez-field"
                  type="number"
                  label="Budget from (PHP)"
                  labelPlacement="stacked"
                  placeholder="60000"
                  value={form.budgetMin}
                  onIonInput={set('budgetMin')}
                />
                {errors.budgetMin && <p className="kez-form-error">{errors.budgetMin}</p>}
              </div>
              <div>
                <IonInput
                  className="kez-field"
                  type="number"
                  label="Budget to (PHP)"
                  labelPlacement="stacked"
                  placeholder="90000"
                  value={form.budgetMax}
                  onIonInput={set('budgetMax')}
                />
                {errors.budgetMax && <p className="kez-form-error">{errors.budgetMax}</p>}
              </div>
            </div>

            <LocationPicker
              onChange={(location) => setForm((prev) => ({ ...prev, location }))}
              barangayPlaceholder="Any barangay"
            />
            {errors.location && <p className="kez-form-error">{errors.location}</p>}

            <IonTextarea
              className="kez-field"
              label="Notes (optional)"
              labelPlacement="stacked"
              placeholder="Papers must be complete, prefer an admin-assisted meet-up"
              autoGrow
              rows={2}
              value={form.notes}
              onIonInput={set('notes')}
            />

            <IonButton type="submit" expand="block" className="kez-cta" disabled={saving}>
              {saving ? <IonSpinner name="crescent" /> : 'Publish post'}
            </IonButton>
          </form>
        </div>
      </IonModal>
    </AppPage>
  );
};

export default Wanted;
