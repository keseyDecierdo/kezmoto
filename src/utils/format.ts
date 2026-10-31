/* Shared formatters so currency, distance and dates look identical everywhere. */

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
});

export const formatPrice = (value: number): string => peso.format(value);

export const formatPriceRange = (min: number, max: number): string =>
  `${peso.format(min)} – ${peso.format(max)}`;

export const formatMileage = (km: number): string =>
  `${new Intl.NumberFormat('en-PH').format(km)} km`;

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/** Compact "3h ago" style stamp used by chat lists and card metadata. */
export const formatRelative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
};

/** Time-of-day greeting: morning 5:00–11:59, afternoon 12:00–17:59, evening otherwise. */
export const greetingFor = (date: Date): string => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const unitTitle = (unit: { brand: string; model: string; year: number }): string =>
  `${unit.brand} ${unit.model}`;
