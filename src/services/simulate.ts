/* =========================================================================
   Review helpers - unchanged from Phase 1.
   Append ?simulate=empty | error | slow to any URL to see the empty, error or
   loading state of a screen without touching the database. `none` (the
   default) lets every call through to Supabase untouched.
   ========================================================================= */

type Simulation = 'none' | 'empty' | 'error' | 'slow';

export const simulation: Simulation = (() => {
  if (typeof window === 'undefined') return 'none';
  const value = new URLSearchParams(window.location.search).get('simulate');
  return value === 'empty' || value === 'error' || value === 'slow' ? value : 'none';
})();

/** Wraps a read so the three review states still work against real data. */
export const settle = async <T>(load: () => Promise<T>, emptyValue?: T): Promise<T> => {
  if (simulation === 'error') {
    throw new Error('Could not reach KEZMOTO. Check your connection and try again.');
  }
  if (simulation === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  const value = await load();
  if (simulation === 'empty' && emptyValue !== undefined) return emptyValue;
  return value;
};

/** Turns a PostgrestError (or anything else) into a message a rider can read. */
export const fail = (error: { message: string } | null, fallback: string): never => {
  throw new Error(error?.message ? `${fallback} (${error.message})` : fallback);
};
