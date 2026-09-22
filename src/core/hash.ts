/**
 * Small, dependency-free hashing utilities.
 *
 * Everything here is pure JavaScript (no Node `crypto`), so the library runs
 * unchanged in browsers, workers and Node. Results are identical on every
 * platform: no locale-sensitive comparisons, no floating-point surprises.
 */

/**
 * 64-bit string hash (cyrb53 variant), returned as two unsigned 32-bit lanes.
 * Not cryptographic; used for determinism and fast equality keys.
 * @param str - The string to hash
 * @param seed - Optional seed to derive independent hash families
 */
export function hashString(str: string, seed: number = 0): [number, number] {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

/**
 * Hashes any JSON-serialisable value to an unsigned 32-bit integer.
 * Handy for deriving per-move or per-entity seeds: `hash32(['river', x, y])`.
 */
export function hash32(value: unknown, seed: number = 0): number {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return hashString(str ?? 'undefined', seed)[0];
}

/** Formats an unsigned 32-bit integer as 8 lowercase hex digits. */
export function toHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}
