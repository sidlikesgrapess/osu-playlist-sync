/**
 * Input validation for route handlers.
 *
 * Every route validates its query params with these *before* any upstream fetch (N8),
 * so a malformed request never spends an osu! API call or an outbound extractor fetch.
 * A failure here is always the caller's fault, so it always carries `.status = 400` and
 * is safe to report back verbatim -- unlike an upstream error, which routes must not echo.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/**
 * A plain string, bounded in length. Required by default: missing, null or empty throws.
 * Pass `required: false` for an optional field, which returns '' when absent instead.
 */
export function boundedString(v, { name, max = 500, required = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ValidationError(`${name} is required`);
    return '';
  }

  const str = String(v);
  if (str.length > max) {
    throw new ValidationError(`${name} must be at most ${max} characters`);
  }
  return str;
}

/**
 * An osu! id (beatmapset id, user id, ...): digits only, no leading zero, no sign,
 * at most 10 digits. This is the one shape every path-traversal or injection attempt
 * (`1%2F..%2Fx`, `abc`, a negative number) fails, while every real osu! id passes.
 */
export function positiveIntId(v, { name } = {}) {
  const str = String(v ?? '');
  if (!/^[1-9]\d{0,9}$/.test(str)) {
    throw new ValidationError(`${name} must be a positive integer id`);
  }
  return Number(str);
}

/**
 * A bounded list of bounded strings. Unlike the other two, this never 400s: a caller
 * that sends too many fallbacks or an over-long query is just truncated, because a
 * fallback list is a hint the matcher may ignore, not a value it must reject outright.
 */
export function boundedStringArray(v, { name, maxItems = 8, maxLen = 200 } = {}) {
  const arr = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return arr.slice(0, maxItems).map((item) => String(item).slice(0, maxLen));
}
