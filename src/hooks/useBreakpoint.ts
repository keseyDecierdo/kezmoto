import { useEffect, useState } from 'react';

/** KEZMOTO breakpoints: mobile <=599 · tablet 600-1023 · desktop >=1024 */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const BREAKPOINTS = {
  tablet: '(min-width: 600px)',
  desktop: '(min-width: 1024px)',
} as const;

const read = (): Breakpoint => {
  if (typeof window === 'undefined') return 'mobile';
  if (window.matchMedia(BREAKPOINTS.desktop).matches) return 'desktop';
  if (window.matchMedia(BREAKPOINTS.tablet).matches) return 'tablet';
  return 'mobile';
};

/** Subscribes to viewport changes so layouts can branch (e.g. chat panes). */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(read);

  useEffect(() => {
    const queries = [
      window.matchMedia(BREAKPOINTS.tablet),
      window.matchMedia(BREAKPOINTS.desktop),
    ];
    const update = () => setBreakpoint(read());
    queries.forEach((q) => q.addEventListener('change', update));
    update();
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);

  return breakpoint;
}

/** True from tablet width up - the point where split layouts kick in. */
export function useIsWide(): boolean {
  return useBreakpoint() !== 'mobile';
}
