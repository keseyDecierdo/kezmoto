import React, { useCallback, useRef, useState } from 'react';
import { IonButton, IonIcon } from '@ionic/react';
import { arrowUndoOutline, closeOutline, trashOutline } from 'ionicons/icons';
import type { RedactionBox } from '../types';
import './RedactionCanvas.css';

interface RedactionCanvasProps {
  imageUrl: string;
  label: string;
  redactions: RedactionBox[];
  onChange: (next: RedactionBox[]) => void;
}

interface DraftRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Anything smaller than this (in normalised units) is treated as a stray tap. */
const MIN_SIZE = 0.015;

const toBox = (draft: DraftRect): Omit<RedactionBox, 'id'> => ({
  x: Math.min(draft.x0, draft.x1),
  y: Math.min(draft.y0, draft.y1),
  width: Math.abs(draft.x1 - draft.x0),
  height: Math.abs(draft.y1 - draft.y0),
});

/**
 * Click-and-drag redaction tool. Boxes are stored as normalised (0–1)
 * rectangles so they survive any render size, and — once documents live in
 * storage — can be burned into the image server-side without recalculation.
 */
const RedactionCanvas: React.FC<RedactionCanvasProps> = ({
  imageUrl,
  label,
  redactions,
  onChange,
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DraftRect | null>(null);

  const pointFrom = useCallback((event: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent) => {
    // Ignore the delete buttons layered on top of existing boxes.
    if ((event.target as HTMLElement).closest('.redact__remove')) return;
    event.preventDefault();
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* capture unavailable — drawing still tracks pointermove */
    }
    const { x, y } = pointFrom(event);
    setDraft({ x0: x, y0: y, x1: x, y1: y });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!draft) return;
    const { x, y } = pointFrom(event);
    setDraft((prev) => (prev ? { ...prev, x1: x, y1: y } : prev));
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!draft) return;
    const box = toBox(draft);
    setDraft(null);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    if (box.width < MIN_SIZE || box.height < MIN_SIZE) return;
    onChange([...redactions, { ...box, id: `r-${Date.now().toString(36)}` }]);
  };

  const draftBox = draft ? toBox(draft) : null;

  return (
    <div className="redact">
      <div className="redact__toolbar">
        <span className="redact__hint">
          Drag across anything private — plate, name, address — to black it out.
        </span>
        <div className="redact__tools">
          <IonButton
            size="small"
            fill="clear"
            color="medium"
            disabled={redactions.length === 0}
            onClick={() => onChange(redactions.slice(0, -1))}
          >
            <IonIcon slot="start" icon={arrowUndoOutline} />
            Undo
          </IonButton>
          <IonButton
            size="small"
            fill="clear"
            color="danger"
            disabled={redactions.length === 0}
            onClick={() => onChange([])}
          >
            <IonIcon slot="start" icon={trashOutline} />
            Clear
          </IonButton>
        </div>
      </div>

      <div
        ref={surfaceRef}
        className={`redact__surface${draft ? ' is-drawing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="application"
        aria-label={`Redaction canvas for ${label}`}
      >
        <img src={imageUrl} alt={label} draggable={false} />

        {redactions.map((box) => (
          <div
            key={box.id}
            className="redact__box"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
          >
            <button
              type="button"
              className="redact__remove"
              aria-label="Remove this redaction"
              onClick={() => onChange(redactions.filter((r) => r.id !== box.id))}
            >
              <IonIcon icon={closeOutline} />
            </button>
          </div>
        ))}

        {draftBox && (
          <div
            className="redact__box redact__box--draft"
            style={{
              left: `${draftBox.x * 100}%`,
              top: `${draftBox.y * 100}%`,
              width: `${draftBox.width * 100}%`,
              height: `${draftBox.height * 100}%`,
            }}
          />
        )}
      </div>

      <p className="kez-muted redact__count">
        {redactions.length === 0
          ? 'No redactions yet on this document.'
          : `${redactions.length} area${redactions.length > 1 ? 's' : ''} redacted.`}
      </p>
    </div>
  );
};

export default RedactionCanvas;
