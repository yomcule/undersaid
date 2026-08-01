/**
 * PostgREST returns a single object for a many-to-one embed, but without
 * generated database types the JS client widens it to an array. Until
 * `supabase gen types` has been run against a live project, normalise here
 * rather than casting at every call site.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
