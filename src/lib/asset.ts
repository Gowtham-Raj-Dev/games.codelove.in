const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefixes a /public asset path with the configured basePath (next/link does this itself; raw URLs don't). */
export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
