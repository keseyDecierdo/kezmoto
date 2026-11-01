import React from 'react';
import { initialsOf } from '../utils/format';
import './Avatar.css';

interface AvatarProps {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Uploaded photo, if any - replaces the initials when set. */
  imageUrl?: string;
  /** Small cyan dot for verified accounts. */
  verified?: boolean;
}

/** Photo when one is set, initials otherwise. */
const Avatar: React.FC<AvatarProps> = ({ name, color = '#ff6a00', size = 'md', imageUrl, verified }) => (
  <span
    className={`kez-avatar kez-avatar--${size}`}
    style={{ ['--avatar-color' as string]: color }}
    aria-hidden="true"
  >
    {imageUrl ? <img className="kez-avatar__img" src={imageUrl} alt="" /> : initialsOf(name) || '?'}
    {verified && <span className="kez-avatar__dot" />}
  </span>
);

export default Avatar;
