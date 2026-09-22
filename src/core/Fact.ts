import { hashString } from './hash.js';

// Caches live outside the instance so facts stay plain {predicate, args}
// objects: deep-equality checks, JSON and console output are unaffected.
const keyCache = new WeakMap<Fact, string>();
const hashCache = new WeakMap<Fact, [number, number]>();

/**
 * Represents an (arti)fact on the blackboard - a piece of generated data.
 * Facts are the fundamental units of information in the ecological generative system.
 *
 * Facts are immutable. Two facts are equal when their predicate and arguments
 * serialise identically (structural equality), which is also what the
 * blackboard uses for indexing, lookup and state hashing.
 */
export class Fact {
  public readonly predicate: string;
  public readonly args: readonly any[];

  /**
   * Creates a new Fact.
   * @param predicate - The type/name of the fact (e.g., "planet", "distance")
   * @param args - The arguments/values associated with this fact. A non-array
   *               value is wrapped as a single argument; `undefined` means no arguments.
   */
  constructor(predicate: string, args?: any[] | any) {
    this.predicate = predicate;

    if (Array.isArray(args)) {
      this.args = Object.freeze([...args]);
    } else if (args === undefined) {
      this.args = Object.freeze([]);
    } else {
      this.args = Object.freeze([args]);
    }
  }

  /**
   * Canonical string key for this fact: `JSON.stringify([predicate, args])`.
   * Computed lazily and cached.
   */
  get key(): string {
    let key = keyCache.get(this);
    if (key === undefined) {
      key = Fact.keyOf(this.predicate, this.args);
      keyCache.set(this, key);
    }
    return key;
  }

  /**
   * 64-bit content hash of this fact as two unsigned 32-bit lanes.
   * Computed lazily and cached.
   */
  get hash(): readonly [number, number] {
    let hash = hashCache.get(this);
    if (hash === undefined) {
      hash = hashString(this.key);
      hashCache.set(this, hash);
    }
    return hash;
  }

  /** Computes the canonical key for a predicate/args pair without building a Fact. */
  static keyOf(predicate: string, args: readonly any[]): string {
    return JSON.stringify([predicate, args]);
  }

  /**
   * Returns a string representation of the fact in Lisp-like syntax.
   * @returns String representation like "(predicate arg1 arg2 ...)"
   */
  toString(): string {
    if (this.args.length === 0) {
      return this.predicate;
    }
    const argsStr = this.args.map(arg => String(arg)).join(' ');
    return `(${this.predicate} ${argsStr})`;
  }

  /**
   * Checks if this fact is equal to another fact.
   * Two facts are equal if they have the same predicate and structurally equal arguments.
   */
  equals(other: Fact): boolean {
    if (this === other) return true;
    if (this.predicate !== other.predicate) return false;
    if (this.args.length !== other.args.length) return false;
    return this.key === other.key;
  }

  /**
   * Creates a JSON-serializable representation of the fact.
   */
  toJSON(): [string, any[]] {
    return [this.predicate, [...this.args]];
  }
}
