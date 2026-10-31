import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { alertCircleOutline, cameraOutline, closeOutline } from 'ionicons/icons';
import { AI_IMAGE_MAX_EDGE } from '../utils/imageResize';
import './FaceCaptureModal.css';

interface FaceCaptureModalProps {
  isOpen: boolean;
  onCancel: () => void;
  /** Hands back the captured frame as a File — this component never
      touches storage/AI itself, same as PhotoGallery/RedactionCanvas
      staying pure UI while the page does the actual upload. */
  onCapture: (file: File) => void;
}

/** Translates getUserMedia's error names into something a non-technical
    user can act on, instead of a crash or a blank camera. */
const messageFor = (err: unknown): string => {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was denied. Allow camera access for this site, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  return 'Could not start the camera. Try again.';
};

/**
 * Live in-app camera: a getUserMedia preview with a face-outline guide,
 * capture-then-review (retake or confirm), and careful stream cleanup.
 * Used by Profile.tsx as step 2 of identity verification.
 */
const FaceCaptureModal: React.FC<FaceCaptureModalProps> = ({ isOpen, onCancel, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedFileRef = useRef<File | null>(null);

  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    capturedFileRef.current = null;
    void startCamera();
    return () => stopStream();
  }, [isOpen, startCamera, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    // Clamped rather than full sensor resolution: this frame gets base64'd
    // and sent to Gemini alongside the ID photo, and an oversized pair is
    // what tips those requests into quota/overload failures.
    const scale = Math.min(1, Math.min(AI_IMAGE_MAX_EDGE, 1024) / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
        capturedFileRef.current = file;
        stopStream(); // freeze the frame — don't keep the camera running during review
        setPreviewUrl(URL.createObjectURL(file));
      },
      'image/jpeg',
      0.8
    );
  };

  const handleRetake = () => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    capturedFileRef.current = null;
    void startCamera();
  };

  const handleConfirm = () => {
    if (capturedFileRef.current) onCapture(capturedFileRef.current);
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onCancel} className="kez-modal face-capture__modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Take a selfie</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onCancel} aria-label="Close">
              <IonIcon slot="icon-only" icon={closeOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <div className="kez-modal__body">
        {error ? (
          <div className="face-capture__error">
            <IonIcon icon={alertCircleOutline} />
            <p>{error}</p>
            <IonButton onClick={() => void startCamera()}>Try again</IonButton>
          </div>
        ) : previewUrl ? (
          <div className="face-capture__stage">
            <img src={previewUrl} alt="Captured selfie preview" className="face-capture__preview" />
            <div className="face-capture__actions">
              <IonButton fill="outline" onClick={handleRetake}>
                Retake
              </IonButton>
              <IonButton className="kez-cta" onClick={handleConfirm}>
                Use this photo
              </IonButton>
            </div>
          </div>
        ) : (
          <div className="face-capture__stage">
            <div className="face-capture__frame">
              <video ref={videoRef} autoPlay playsInline muted className="face-capture__video" />
              <div className="face-capture__guide" aria-hidden="true" />
            </div>
            <canvas ref={canvasRef} hidden />
            <p className="kez-muted face-capture__hint">
              Center your face in the outline, in good lighting, then capture.
            </p>
            <IonButton className="kez-cta" disabled={starting} onClick={handleCapture}>
              {starting ? (
                <IonSpinner name="crescent" />
              ) : (
                <>
                  <IonIcon slot="start" icon={cameraOutline} />
                  Capture
                </>
              )}
            </IonButton>
          </div>
        )}
      </div>
    </IonModal>
  );
};

export default FaceCaptureModal;
