/** A blank field means "not set," not the empty string. */
export function textField(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

/** A blank field means "not set," not zero — use `?? 0` at the call site
 * where a blank genuinely should default to zero. */
export function numberField(formData: FormData, key: string): number | null {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : Number(v);
}
