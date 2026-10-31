import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import './PhotoGallery.css';

interface PhotoGalleryProps {
  photos: string[];
  alt: string;
}

/**
 * Mobile: a swipeable, scroll-snapped carousel with dots.
 * Tablet/desktop: the same strip plus a thumbnail rail and arrow controls.
 */
const PhotoGallery: React.FC<PhotoGalleryProps> = ({ photos, alt }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const scrollTo = useCallback((next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(next, photos.length - 1));
    track.scrollTo({ left: track.clientWidth * clamped, behavior: 'smooth' });
    setIndex(clamped);
  }, [photos.length]);

  // Keeps the dots/thumbnails in sync with a manual swipe.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = track.clientWidth || 1;
        setIndex(Math.round(track.scrollLeft / width));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (photos.length === 0) {
    return <div className="gallery gallery--empty">No photos uploaded</div>;
  }

  return (
    <div className="gallery">
      <div className="gallery__stage">
        <div className="gallery__track" ref={trackRef}>
          {photos.map((photo, i) => (
            <div className="gallery__slide" key={photo + i}>
              <img src={photo} alt={`${alt} — photo ${i + 1} of ${photos.length}`} />
            </div>
          ))}
        </div>

        {photos.length > 1 && (
          <>
            <button
              type="button"
              className="gallery__arrow gallery__arrow--prev kez-hide-mobile"
              onClick={() => scrollTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
            >
              <IonIcon icon={chevronBackOutline} />
            </button>
            <button
              type="button"
              className="gallery__arrow gallery__arrow--next kez-hide-mobile"
              onClick={() => scrollTo(index + 1)}
              disabled={index === photos.length - 1}
              aria-label="Next photo"
            >
              <IonIcon icon={chevronForwardOutline} />
            </button>
            <span className="gallery__counter">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>

      {photos.length > 1 && (
        <>
          <div className="gallery__dots kez-hide-desktop" role="tablist" aria-label="Photos">
            {photos.map((photo, i) => (
              <button
                key={`dot-${photo}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Photo ${i + 1}`}
                className={`gallery__dot${i === index ? ' is-active' : ''}`}
                onClick={() => scrollTo(i)}
              />
            ))}
          </div>

          <div className="gallery__thumbs kez-hide-mobile">
            {photos.map((photo, i) => (
              <button
                key={`thumb-${photo}-${i}`}
                type="button"
                className={`gallery__thumb${i === index ? ' is-active' : ''}`}
                onClick={() => scrollTo(i)}
                aria-label={`Show photo ${i + 1}`}
              >
                <img src={photo} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default PhotoGallery;
