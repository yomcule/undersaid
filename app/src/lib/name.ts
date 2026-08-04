export function firstName(fullName: string | null | undefined) {
  if (!fullName) return fullName ?? null;
  return fullName.trim().split(/\s+/)[0];
}
