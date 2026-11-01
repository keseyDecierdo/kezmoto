import React from 'react';
import './BrandMark.css';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * The KEZMOTO logo badge. Used in the menu, headers, the landing hero and
 * splash. The wordmark, icon and tagline are all baked into one image
 * (public/brand/kezmoto-logo.png, cropped from the supplied source art),
 * so - unlike the earlier text-based version - there's no separate
 * tagline to show or hide per usage.
 */
const BrandMark: React.FC<BrandMarkProps> = ({ size = 'md', className }) => (
  <div className={`brandmark brandmark--${size} ${className ?? ''}`}>
    <img className="brandmark__logo" src="/brand/kezmoto-logo.png" alt="KEZMOTO - Buy. Sell. Ride." />
  </div>
);

export default BrandMark;
