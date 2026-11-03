import React, { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonHeader, IonIcon, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline, closeOutline, documentTextOutline, expandOutline } from 'ionicons/icons';
import type { UnitDocument } from '../types';
import './DocumentViewer.css';

/** The document image with the seller's redaction boxes burned on top. */
const RedactedImage: React.FC<{ document: UnitDocument }> = ({ document }) => (
  <div className="doc-view__frame">
    <img src={document.imageUrl} alt={document.label} />
    {document.redactions.map((box) => (
      <span
        key={box.id}
        className="doc-view__redaction"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.width * 100}%`,
          height: `${box.height * 100}%`,
        }}
      />
    ))}
  </div>
);

/** One document card; tapping it opens the large view. */
export const DocumentThumb: React.FC<{ document: UnitDocument; onOpen: () => void }> = ({ document, onOpen }) => (
  <button type="button" className="doc-view__thumb" onClick={onOpen} aria-label={`Open ${document.label}`}>
    <RedactedImage document={document} />
    <span className="doc-view__caption">
      <IonIcon icon={documentTextOutline} aria-hidden="true" />
      <span>{document.label}</span>
      <IonIcon icon={expandOutline} className="doc-view__expand" aria-hidden="true" />
    </span>
  </button>
);

/** Large view of one document at a time, with Previous / Next. */
export const DocumentLightbox: React.FC<{
  documents: UnitDocument[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}> = ({ documents, index, onClose, onIndexChange }) => {
  const current = index != null ? documents[index] : null;
  const many = documents.length > 1;
  const step = (delta: number) =>
    index != null && onIndexChange((index + delta + documents.length) % documents.length);

  useEffect(() => {
    if (index == null || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <IonModal isOpen={current != null} onDidDismiss={onClose} className="kez-modal doc-view__modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>
            {current?.label}
            {many && index != null && (
              <small className="doc-view__count">
                {' '}
                · {index + 1} of {documents.length}
              </small>
            )}
          </IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="kez-modal__body doc-view__body">
        {current && <RedactedImage document={current} />}
        <p className="doc-view__note">Private details blacked out by the seller stay hidden.</p>
        {many && (
          <div className="doc-view__nav">
            <IonButton fill="outline" onClick={() => step(-1)}>
              <IonIcon slot="start" icon={chevronBackOutline} />
              Previous
            </IonButton>
            <IonButton fill="outline" onClick={() => step(1)}>
              Next
              <IonIcon slot="end" icon={chevronForwardOutline} />
            </IonButton>
          </div>
        )}
      </div>
    </IonModal>
  );
};

/** A grid of document cards plus the large viewer they open. */
const DocumentGallery: React.FC<{ documents: UnitDocument[] }> = ({ documents }) => {
  const [open, setOpen] = useState<number | null>(null);
  if (documents.length === 0) return <p className="kez-muted">No documents uploaded.</p>;
  return (
    <>
      <div className="doc-view__grid">
        {documents.map((document, i) => (
          <DocumentThumb key={document.id} document={document} onOpen={() => setOpen(i)} />
        ))}
      </div>
      <DocumentLightbox documents={documents} index={open} onClose={() => setOpen(null)} onIndexChange={setOpen} />
    </>
  );
};

export default DocumentGallery;
