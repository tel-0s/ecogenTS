/**
 * Random number generator interface for consistent usage across strategies
 * and design moves.
 */
export interface RandomGenerator {
  /** Returns a random number between 0 (inclusive) and 1 (exclusive). */
  random(): number;

  /** Returns a random integer between min (inclusive) and max (exclusive). */
  randomInt(min: number, max: number): number;

  /** Randomly selects an element from an array. */
  choice<T>(array: readonly T[]): T;
}

/**
 * Small, fast, seedable PRNG (mulberry32).
 *
 * Any number is accepted as a seed, including negatives and values above
 * 2^32; it is normalised to an unsigned 32-bit integer, so e.g.
 * `baseSeed ^ stateSeed` is always safe to pass in.
 */
export class SimpleRandomGenerator implements RandomGenerator {
  private state: number;

  constructor(seed?: number) {
    const s = seed ?? Math.floor(Math.random() * 0x100000000);
    this.state = Number.isFinite(s) ? s >>> 0 : 0;
  }

  random(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }

  choice<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.randomInt(0, array.length)];
  }
}
