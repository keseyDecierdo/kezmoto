import { describe, expect, it } from 'vitest';
import { formatMileage, formatPriceRange, greetingFor, initialsOf, unitTitle } from './format';
import { activeNavId } from '../navigation/navItems';

describe('formatters', () => {
  it('greets by time of day', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 31, h, m);
    expect(greetingFor(at(5))).toBe('Good morning');
    expect(greetingFor(at(11, 59))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17, 59))).toBe('Good afternoon');
    expect(greetingFor(at(18))).toBe('Good evening');
    expect(greetingFor(at(2))).toBe('Good evening');
  });

  it('formats mileage with a thousands separator', () => {
    expect(formatMileage(14200)).toBe('14,200 km');
  });

  it('renders a budget range with both bounds', () => {
    const range = formatPriceRange(60000, 90000);
    expect(range).toContain('60,000');
    expect(range).toContain('90,000');
  });

  it('builds initials from the first two words only', () => {
    expect(initialsOf('Kez Rivera')).toBe('KR');
    expect(initialsOf('Maria Clara Dela Cruz')).toBe('MC');
  });

  it('titles a unit as brand + model', () => {
    expect(unitTitle({ brand: 'Yamaha', model: 'MT-15', year: 2022 })).toBe('Yamaha MT-15');
  });
});

describe('activeNavId', () => {
  it('prefers the longest matching route so /units/new never selects My Units', () => {
    expect(activeNavId('/units/new')).toBe('sell');
    expect(activeNavId('/units')).toBe('my-units');
  });

  it('maps detail and chat routes back to their tab', () => {
    expect(activeNavId('/listing/l-001')).toBe('home');
    expect(activeNavId('/chat/t-001')).toBe('messages');
    expect(activeNavId('/profile')).toBe('profile');
    expect(activeNavId('/profile/abc')).toBe('sellers');
  });

  it('returns null for public routes', () => {
    expect(activeNavId('/login')).toBeNull();
  });
});
