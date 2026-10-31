import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonIcon, IonInput, IonSpinner, IonTextarea, useIonRouter, useIonToast } from '@ionic/react';
import { useLocation } from 'react-router-dom';
import {
  logOutOutline,
  mailOutline,
  phonePortraitOutline,
  locationOutline,
  calendarOutline,
  logoFacebook,
  cameraOutline,
  cloudUploadOutline,
  eyeOutline,
  shieldCheckmarkOutline,
  alertCircleOutline,
  lockClosedOutline,
  refreshOutline,
} from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import FaceCaptureModal from '../components/FaceCaptureModal';
import { useAuth } from '../context/AuthContext';
import { photoUrl, signIdDocumentUrl, uploadPhoto } from '../services/storageService';
import type { IdType } from '../types';
import { ID_TYPE_LABEL } from '../types';
import { formatDate } from '../utils/format';
import { downscaleImage } from '../utils/imageResize';
import './Profile.css';

const ID_TYPES: IdType[] = ['national_id', 'drivers_license'];

/** Profile & settings: read-only summary plus an editable details form. */
const Profile: React.FC = () => {
  const {
    user,
    isAdmin,
    updateProfile,
    submitIdVerification,
    submitFaceCapture,
    retryIdVerification,
    retryFaceCapture,
    logout,
  } = useAuth();
  const [present] = useIonToast();
  const router = useIonRouter();
  const location = useLocation();
  /* Sent here by the sign-in redirect or by tapping Sell while unverified. */
  const requiredVerify = new URLSearchParams(location.search).get('verify') === '1';
  /* Only celebrate the moment verification completes, not on every visit. */
  const [justVerified, setJustVerified] = useState(false);

  const [form, setForm] = useState({ name: '', phone: '', location: '', bio: '', facebook: '' });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [checkingId, setCheckingId] = useState(false);
  const [viewingId, setViewingId] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [idType, setIdType] = useState<IdType>('national_id');
  const [faceModalOpen, setFaceModalOpen] = useState(false);
  const [checkingFace, setCheckingFace] = useState(false);
  /* The AI check *failing* (Gemini busy, network blip — nothing written to
     the profile) is a different situation from it succeeding and reporting a
     genuine mismatch, which persists its own note. Only the former can be
     usefully re-run against the same photo, so it needs its own state. */
  const [idError, setIdError] = useState<string | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      phone: user.phone,
      location: user.location,
      bio: user.bio,
      facebook: user.facebook,
    });
    if (user.idType) setIdType(user.idType);
    setDirty(false);
  }, [user]);

  if (!user) return null;

  const set = (key: keyof typeof form) => (event: CustomEvent) => {
    setForm((prev) => ({ ...prev, [key]: String(event.detail.value ?? '') }));
    setDirty(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      await present({ message: 'Name cannot be empty.', duration: 2000, color: 'danger', position: 'top' });
      return;
    }
    const facebook = form.facebook.trim();
    if (facebook && !facebook.toLowerCase().includes('facebook.com')) {
      await present({
        message: "That doesn't look like a Facebook link.",
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        bio: form.bio.trim(),
        facebook,
      });
      setDirty(false);
      await present({ message: 'Profile updated.', duration: 1800, color: 'success', position: 'top' });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not save your profile.',
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSaving(false);
    }
  };

  /** Runs one verification step, reporting a thrown failure (which wrote
      nothing) separately from a completed check that reported a mismatch. */
  const runStep = async (
    check: () => Promise<{ matched: boolean }>,
    copy: { ok: string; mismatch: string; failed: string },
    setChecking: (value: boolean) => void,
    setError: (value: string | null) => void
  ) => {
    setChecking(true);
    setError(null);
    try {
      const { matched } = await check();
      if (matched && copy === FACE_COPY) setJustVerified(true);
      await present({
        message: matched ? copy.ok : copy.mismatch,
        duration: 2800,
        color: matched ? 'success' : 'warning',
        position: 'top',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : copy.failed;
      setError(message);
      await present({ message, duration: 2800, color: 'danger', position: 'top' });
    } finally {
      setChecking(false);
    }
  };

  const ID_COPY = {
    ok: 'Step 1 done — the name matches your profile. Now scan your face to finish.',
    mismatch: "The name on that ID doesn't match your profile name. See the note below.",
    failed: 'Could not verify that ID.',
  };

  const FACE_COPY = {
    ok: "Face match confirmed — you're fully ID verified and can now post motorcycles.",
    mismatch: "That selfie didn't match the face on your ID. See the note below.",
    failed: 'Could not check that selfie.',
  };

  const pickId = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    await runStep(
      async () => submitIdVerification(await downscaleImage(file), idType),
      ID_COPY,
      setCheckingId,
      setIdError
    );
  };

  const handleFaceCapture = async (file: File) => {
    setFaceModalOpen(false);
    await runStep(() => submitFaceCapture(file), FACE_COPY, setCheckingFace, setFaceError);
  };

  const recheckId = () =>
    runStep(() => retryIdVerification(idType), ID_COPY, setCheckingId, setIdError);

  const recheckFace = () => runStep(retryFaceCapture, FACE_COPY, setCheckingFace, setFaceError);

  const pickAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const path = await uploadPhoto(user.id, file);
      await updateProfile({ avatarUrl: photoUrl(path) });
      await present({ message: 'Profile picture updated.', duration: 1800, color: 'success', position: 'top' });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Could not upload that picture.',
        duration: 2400,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const viewId = async () => {
    setViewingId(true);
    try {
      const url = await signIdDocumentUrl(user.idDocumentUrl || null);
      if (!url) {
        await present({
          message: 'Could not open your ID right now. Try again in a moment.',
          duration: 2400,
          color: 'danger',
          position: 'top',
        });
        return;
      }
      window.open(url, '_blank', 'noopener');
    } finally {
      setViewingId(false);
    }
  };

  return (
    <AppPage title="Profile & Settings">
      <div className="kez-bento profile">
        {!isAdmin && !user.verified && (
          <section className={`kez-tile kez-tile--full profile__verify-notice${requiredVerify ? ' is-required' : ''}`}>
            <IonIcon icon={shieldCheckmarkOutline} />
            <div>
              <strong>Verify your identity to start selling</strong>
              <p>
                {requiredVerify
                  ? 'You need to finish both steps below before you can post a motorcycle.'
                  : 'Finish both steps below to unlock posting motorcycles.'}
              </p>
              <ul>
                <li className={user.idNameMatched ? 'is-done' : ''}>
                  Step 1 · Upload a valid ID {user.idNameMatched ? '— done' : ''}
                </li>
                <li className={user.faceVerified ? 'is-done' : ''}>
                  Step 2 · Scan your face {user.faceVerified ? '— done' : ''}
                </li>
              </ul>
            </div>
          </section>
        )}
        {!isAdmin && user.verified && justVerified && (
          <section className="kez-tile kez-tile--full profile__verify-notice is-done">
            <IonIcon icon={shieldCheckmarkOutline} />
            <div>
              <strong>You're verified</strong>
              <p>Both steps are complete. You can post your first motorcycle now.</p>
              <IonButton size="small" className="kez-cta" onClick={() => router.push('/units/new', 'forward')}>
                Post your first unit
              </IonButton>
            </div>
          </section>
        )}
        <section className="kez-tile profile__card">
          <button
            type="button"
            className="profile__avatar-picker"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change profile picture"
          >
            <Avatar name={user.name} color={user.avatarColor} imageUrl={user.avatarUrl} size="lg" verified={user.verified} />
            <span className="profile__avatar-overlay">
              {uploadingAvatar ? <IonSpinner name="crescent" /> : <IonIcon icon={cameraOutline} />}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void pickAvatar(event)}
          />
          <div className="profile__identity">
            <h1 className="kez-display">{user.name}</h1>
            <div className="profile__identity-chips">
              <span className={`kez-chip ${isAdmin ? 'kez-chip--warning' : 'kez-chip--accent'}`}>
                {isAdmin ? 'Admin · Middleman' : 'Customer'}
              </span>
              <span
                className={`kez-chip ${
                  user.verified
                    ? 'kez-chip--success'
                    : user.idNameMatched
                      ? 'kez-chip--warning'
                      : ''
                }`}
              >
                <IonIcon icon={user.verified ? shieldCheckmarkOutline : alertCircleOutline} />
                {user.verified
                  ? 'ID Verified'
                  : user.idNameMatched
                    ? 'Face scan pending'
                    : 'Not ID verified'}
              </span>
            </div>
          </div>

          <ul className="profile__facts">
            <li>
              <IonIcon icon={mailOutline} />
              {user.email}
            </li>
            <li>
              <IonIcon icon={phonePortraitOutline} />
              {user.phone || 'No contact number yet'}
            </li>
            <li>
              <IonIcon icon={locationOutline} />
              {user.location || 'No location set'}
            </li>
            <li>
              <IonIcon icon={calendarOutline} />
              Member since {formatDate(user.memberSince)}
            </li>
            {user.facebook && (
              <li>
                <IonIcon icon={logoFacebook} />
                <a href={user.facebook} target="_blank" rel="noreferrer">
                  Facebook profile
                </a>
              </li>
            )}
          </ul>

          <IonButton
            fill="outline"
            color="danger"
            className="profile__signout"
            onClick={() => logout()}
          >
            <IonIcon slot="start" icon={logOutOutline} />
            Logout
          </IonButton>
        </section>

        <section className="kez-tile kez-tile--w2 profile__form-wrap">
          <h2 className="kez-display">Edit details</h2>
          <p className="kez-muted">
            Buyers see your name and location on every unit you list. Your email stays private.
          </p>

          <form className="profile__form" onSubmit={save}>
            <IonInput
              className="kez-field"
              label="Full name"
              labelPlacement="stacked"
              value={form.name}
              onIonInput={set('name')}
            />
            <IonInput
              className="kez-field"
              type="tel"
              label="Mobile number"
              labelPlacement="stacked"
              placeholder="+63 9XX XXX XXXX"
              value={form.phone}
              onIonInput={set('phone')}
            />
            <IonInput
              className="kez-field"
              label="City / Municipality"
              labelPlacement="stacked"
              placeholder="Cebu City, Cebu"
              value={form.location}
              onIonInput={set('location')}
            />
            <IonInput
              className="kez-field"
              type="url"
              label="Facebook profile"
              labelPlacement="stacked"
              placeholder="https://facebook.com/your.name"
              value={form.facebook}
              onIonInput={set('facebook')}
            />
            <IonTextarea
              className="kez-field profile__field--full"
              label="About you"
              labelPlacement="stacked"
              placeholder="Tell buyers how you ride and maintain your units."
              autoGrow
              rows={2}
              value={form.bio}
              onIonInput={set('bio')}
            />

            <div className="profile__actions">
              <IonButton type="submit" className="kez-cta" disabled={saving || !dirty}>
                {saving ? <IonSpinner name="crescent" /> : 'Save changes'}
              </IonButton>
              {!dirty && !saving && <span className="profile__hint">Make a change to save</span>}
            </div>
          </form>
        </section>

        <section className="kez-tile profile__id">
            <h2 className="kez-display">Identity verification</h2>
            <p className="kez-muted">
              Upload an ID, then scan your face. Others only see the "Verified" badge — never
              your ID or selfie.
            </p>

            {/* ---------------------- Step 1 — valid ID ---------------------- */}
            <p className="profile__step-label">
              <span className={`profile__step-num${user.idNameMatched ? ' is-done' : ''}`}>1</span>
              Upload a valid ID
            </p>

            <div className="profile__id-type" role="radiogroup" aria-label="ID type">
              {ID_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={idType === type}
                  className={`profile__id-type-btn${idType === type ? ' is-active' : ''}`}
                  onClick={() => setIdType(type)}
                >
                  {ID_TYPE_LABEL[type]}
                </button>
              ))}
            </div>

            <input
              ref={idInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => void pickId(event)}
            />

            {checkingId ? (
              <div className="profile__id-status">
                <IonSpinner name="dots" />
                <span>Reading your ID…</span>
              </div>
            ) : (
              <div className="profile__id-actions">
                <button
                  type="button"
                  className="profile__id-picker"
                  onClick={() => idInputRef.current?.click()}
                >
                  <IonIcon icon={cloudUploadOutline} />
                  {user.idNameMatched
                    ? `Replace ${ID_TYPE_LABEL[idType]}`
                    : user.idVerificationNote
                      ? 'Try again'
                      : `Upload your ${ID_TYPE_LABEL[idType]}`}
                </button>

                {user.idDocumentUrl && (
                  <button
                    type="button"
                    className="profile__id-view"
                    disabled={viewingId}
                    onClick={() => void viewId()}
                  >
                    {viewingId ? <IonSpinner name="crescent" /> : <IonIcon icon={eyeOutline} />}
                    View
                  </button>
                )}
              </div>
            )}

            {/* The check itself failed, so the photo is uploaded but unjudged
                — re-run it without making them pick the file again. */}
            {!checkingId && idError && user.idDocumentUrl && (
              <div className="profile__id-retry">
                <p className="profile__id-note">
                  <IonIcon icon={alertCircleOutline} />
                  {idError}
                </p>
                <IonButton size="small" fill="outline" onClick={() => void recheckId()}>
                  <IonIcon slot="start" icon={refreshOutline} />
                  Check again
                </IonButton>
              </div>
            )}

            {!checkingId && user.idVerificationNote && (
              <p className="profile__id-note">
                <IonIcon icon={alertCircleOutline} />
                {user.idVerificationNote}
              </p>
            )}

            {/* --------------------- Step 2 — face match --------------------- */}
            <p className="profile__step-label">
              <span className={`profile__step-num${user.faceVerified ? ' is-done' : ''}`}>2</span>
              Scan your face
            </p>

            {!user.idNameMatched ? (
              <p className="profile__step-locked">
                <IonIcon icon={lockClosedOutline} />
                Finish step 1 first — your selfie is compared against the ID photo you upload there.
              </p>
            ) : checkingFace ? (
              <div className="profile__id-status">
                <IonSpinner name="dots" />
                <span>Comparing your selfie with your ID…</span>
              </div>
            ) : (
              <div className="profile__id-actions">
                <button
                  type="button"
                  className="profile__id-picker"
                  onClick={() => setFaceModalOpen(true)}
                >
                  <IonIcon icon={user.faceVerified ? shieldCheckmarkOutline : cameraOutline} />
                  {user.faceVerified
                    ? '✓ Face verified — scan again'
                    : user.faceVerificationNote
                      ? 'Try again'
                      : 'Open camera and scan my face'}
                </button>
              </div>
            )}

            {!checkingFace && faceError && user.faceCaptureUrl && (
              <div className="profile__id-retry">
                <p className="profile__id-note">
                  <IonIcon icon={alertCircleOutline} />
                  {faceError}
                </p>
                <IonButton size="small" fill="outline" onClick={() => void recheckFace()}>
                  <IonIcon slot="start" icon={refreshOutline} />
                  Check again
                </IonButton>
              </div>
            )}

            {!checkingFace && user.faceVerificationNote && (
              <p className="profile__id-note">
                <IonIcon icon={alertCircleOutline} />
                {user.faceVerificationNote}
              </p>
            )}
        </section>
      </div>

      <FaceCaptureModal
        isOpen={faceModalOpen}
        onCancel={() => setFaceModalOpen(false)}
        onCapture={(file) => void handleFaceCapture(file)}
      />
    </AppPage>
  );
};

export default Profile;
