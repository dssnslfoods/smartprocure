// Supabase Storage object keys must be ASCII-safe — Thai characters and spaces in
// a key cause the upload to fail. Two strategies, both used deliberately:
//
//   randomStorageName — discards the original name for an opaque UUID. Use when the
//                       display name is kept elsewhere (a DB column) and the key
//                       only has to be unique.
//   safeStorageName   — keeps a readable ASCII slug of the original name. Callers
//                       prefix it with a timestamp for uniqueness.

/** `<uuid>.<ext>` — always unique, original name discarded. */
export function randomStorageName(fileName: string): string {
  const ext = fileName.split('.').pop() || 'bin';
  return `${crypto.randomUUID()}.${ext}`;
}

/**
 * ASCII slug of the original name, extension preserved. A name with no ASCII
 * word characters (e.g. an all-Thai filename) collapses to `file`, so callers
 * must add their own uniqueness prefix.
 */
export function safeStorageName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'file';
  const ext = dot > 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]+/g, '') : '';
  return `${base}${ext}`;
}
