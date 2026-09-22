import { Fact } from './Fact.js';
import { Query, Bindings, Pattern } from './Query.js';
import { hashString, hash32, toHex32 } from './hash.js';
import { SimpleRandomGenerator } from './random.js';

/**
 * Options for multi-pattern matching with {@link Blackboard.match}.
 */
export interface MatchOptions {
  /**
   * Negated patterns: a result is rejected if ANY of these has a matching fact
   * under the result's bindings. Variables left unbound act as wildcards.
   * (Datalog's `not` / `missing?`.)
   */
  not?: readonly Pattern[];
  /** Arbitrary filter on the final bindings. */
  where?: (bindings: Bindings, blackboard: Blackboard) => boolean;
  /** Bindings to start from. */
  bindings?: Bindings;
}

/**
 * Central shared data repository that holds all (arti)facts.
 * The blackboard is the core data structure of the ecological generative system.
 *
 * Performance characteristics:
 * - facts are indexed by predicate, so a query only scans facts of its predicate;
 * - a fully ground pattern (no unbound variables) is an O(1) lookup;
 * - the state hash is an order-independent multiset hash maintained
 *   incrementally, so {@link getStateHash} / {@link getStateSeed} are O(1).
 *
 * Do not mutate the blackboard while iterating one of its query generators.
 */
export class Blackboard {
  private _facts: Fact[] = [];
  private _byPredicate = new Map<string, Fact[]>();
  private _counts = new Map<string, number>();
  private _snapshot: readonly Fact[] | null = null;
  private _hashLo = 0;
  private _hashHi = 0;
  private _version = 0;

  /**
   * All facts currently on the blackboard, in insertion order.
   * Returns a frozen snapshot; it is cached until the blackboard changes.
   */
  get facts(): readonly Fact[] {
    if (this._snapshot === null) {
      this._snapshot = Object.freeze(this._facts.slice());
    }
    return this._snapshot;
  }

  /** Number of facts on the blackboard. */
  get size(): number {
    return this._facts.length;
  }

  /** Increments on every change. Useful for cheap dirty-checking. */
  get version(): number {
    return this._version;
  }

  /**
   * Adds a new fact to the blackboard. Duplicates are allowed (the blackboard is a multiset).
   * @param fact - The fact to add
   */
  addFact(fact: Fact): void {
    this._facts.push(fact);
    let bucket = this._byPredicate.get(fact.predicate);
    if (bucket === undefined) {
      bucket = [];
      this._byPredicate.set(fact.predicate, bucket);
    }
    bucket.push(fact);
    this._counts.set(fact.key, (this._counts.get(fact.key) ?? 0) + 1);
    const [lo, hi] = fact.hash;
    this._hashLo = (this._hashLo + lo) >>> 0;
    this._hashHi = (this._hashHi + hi) >>> 0;
    this._changed();
  }

  /**
   * Adds multiple facts to the blackboard.
   * @param facts - The facts to add
   */
  addFacts(facts: readonly Fact[]): void {
    for (const fact of facts) this.addFact(fact);
  }

  /**
   * Removes one instance of a fact (compared structurally).
   * @returns True if a matching fact was found and removed
   */
  removeFact(fact: Fact): boolean {
    const count = this._counts.get(fact.key);
    if (!count) return false;

    const bucket = this._byPredicate.get(fact.predicate)!;
    const bi = bucket.findIndex(f => f.key === fact.key);
    const stored = bucket[bi];
    bucket.splice(bi, 1);
    if (bucket.length === 0) this._byPredicate.delete(fact.predicate);
    this._facts.splice(this._facts.indexOf(stored), 1);

    if (count === 1) this._counts.delete(fact.key);
    else this._counts.set(fact.key, count - 1);

    const [lo, hi] = fact.hash;
    this._hashLo = (this._hashLo - lo) >>> 0;
    this._hashHi = (this._hashHi - hi) >>> 0;
    this._changed();
    return true;
  }

  /**
   * Removes one instance of each given fact.
   * @returns Number of facts actually removed
   */
  removeFacts(facts: readonly Fact[]): number {
    let removed = 0;
    for (const fact of facts) if (this.removeFact(fact)) removed++;
    return removed;
  }

  /**
   * Removes every fact matching a pattern.
   * @returns The facts that were removed
   */
  retract(pattern: Pattern, bindings?: Bindings): Fact[] {
    const query = Query.from(pattern);
    const bucket = this._byPredicate.get(query.predicate);
    if (!bucket) return [];
    const doomed = bucket.filter(f => query.matches(f, bindings) !== null);
    for (const fact of doomed) this.removeFact(fact);
    return doomed;
  }

  /**
   * Executes a single-fact query against the blackboard, yielding all matching bindings.
   * @param pattern - The query to execute
   * @param bindings - Optional bindings the match must respect
   * @returns An iterator of variable bindings for each match
   */
  *query(pattern: Pattern, bindings?: Bindings): IterableIterator<Bindings> {
    const query = Query.from(pattern);

    // Fully ground pattern: O(1) lookup, one result per stored copy.
    const { args, ground } = query.substitute(bindings);
    if (ground) {
      const n = this._counts.get(Fact.keyOf(query.predicate, args)) ?? 0;
      for (let i = 0; i < n; i++) yield bindings ? { ...bindings } : {};
      return;
    }

    const bucket = this._byPredicate.get(query.predicate);
    if (!bucket) return;
    for (const fact of bucket) {
      const result = query.matches(fact, bindings);
      if (result !== null) yield result;
    }
  }

  /**
   * Executes a query and returns the first matching binding, if any.
   */
  queryOne(pattern: Pattern, bindings?: Bindings): Bindings | null {
    for (const result of this.query(pattern, bindings)) {
      return result;
    }
    return null;
  }

  /**
   * Conjunctive query: yields every combination of facts that satisfies ALL
   * patterns with consistent variable bindings (a join), then applies the
   * `not` and `where` filters.
   *
   * An empty pattern list yields a single empty binding (subject to filters),
   * which is useful for "create something" moves guarded by `where`.
   *
   * @example
   * // every scene without a background, paired with every known background
   * bb.match([['scene', '?s'], ['background', '?b', '?size']],
   *          { not: [['scene-background', '?s', '?_']] })
   */
  *match(patterns: readonly Pattern[], options: MatchOptions = {}): IterableIterator<Bindings> {
    const queries = patterns.map(Query.from);
    const negated = (options.not ?? []).map(Query.from);
    const where = options.where;

    const self = this;
    function* join(i: number, bindings: Bindings): IterableIterator<Bindings> {
      if (i === queries.length) {
        for (const q of negated) {
          if (self.exists(q, bindings)) return;
        }
        if (where && !where(bindings, self)) return;
        yield bindings;
        return;
      }
      for (const next of self.query(queries[i], bindings)) {
        yield* join(i + 1, next);
      }
    }

    yield* join(0, options.bindings ? { ...options.bindings } : {});
  }

  /**
   * True if at least one fact matches the pattern (under optional bindings).
   * Unbound and anonymous variables act as wildcards.
   *
   * @example bb.exists(['planet-size', 'Earth', '?_'])
   */
  exists(pattern: Pattern, bindings?: Bindings): boolean {
    return !this.query(pattern, bindings).next().done;
  }

  /**
   * Counts facts. With a predicate string, counts facts of that predicate
   * (any arity) in O(1); with an array/Query pattern, counts matches.
   */
  count(pattern: Pattern, bindings?: Bindings): number {
    if (typeof pattern === 'string') {
      return this._byPredicate.get(pattern)?.length ?? 0;
    }
    let n = 0;
    for (const _ of this.query(pattern, bindings)) n++;
    return n;
  }

  /**
   * Checks if a specific fact exists on the blackboard (exact arguments). O(1).
   * For partial matches use {@link exists} with '?_' wildcards.
   */
  hasFact(predicate: string, ...args: any[]): boolean {
    return (this._counts.get(Fact.keyOf(predicate, args)) ?? 0) > 0;
  }

  /**
   * Gets all facts, optionally filtered by predicate.
   * @param predicate - Optional predicate to filter by
   * @returns A fresh array of facts
   */
  getFacts(predicate?: string): Fact[] {
    if (predicate === undefined) {
      return this._facts.slice();
    }
    return this._byPredicate.get(predicate)?.slice() ?? [];
  }

  /** All predicates currently present on the blackboard. */
  predicates(): string[] {
    return [...this._byPredicate.keys()];
  }

  /**
   * Deterministic hash of the current blackboard contents (16 hex digits).
   * Independent of insertion order; identical across platforms. O(1).
   */
  getStateHash(): string {
    const [a, b] = this._mixedState();
    return toHex32(a) + toHex32(b);
  }

  /**
   * Deterministic unsigned 32-bit seed derived from the blackboard contents. O(1).
   */
  getStateSeed(): number {
    return this._mixedState()[0];
  }

  /**
   * A PRNG seeded from the current blackboard state and an optional salt.
   * The recommended way for design moves to get randomness: the result depends
   * only on what is on the blackboard, so generation stays reproducible.
   *
   * @param salt - Anything JSON-serialisable that distinguishes this use,
   *               e.g. the move name plus its bindings.
   */
  rng(salt?: unknown): SimpleRandomGenerator {
    const seed = salt === undefined ? this.getStateSeed() : hash32(salt, this.getStateSeed());
    return new SimpleRandomGenerator(seed);
  }

  /**
   * Returns a string representation of the blackboard.
   */
  toString(): string {
    return `Blackboard(${this._facts.length} facts)`;
  }

  /**
   * Returns a detailed string representation of the blackboard.
   */
  toDetailedString(): string {
    if (this._facts.length === 0) {
      return 'Blackboard:\n  (empty)';
    }
    const factsStr = this._facts.map(fact => `  ${fact.toString()}`).join('\n');
    return `Blackboard:\n${factsStr}`;
  }

  /**
   * Clears all facts from the blackboard.
   */
  clear(): void {
    this._facts = [];
    this._byPredicate.clear();
    this._counts.clear();
    this._hashLo = 0;
    this._hashHi = 0;
    this._changed();
  }

  /**
   * Creates a copy of the blackboard. Facts are immutable, so they are shared.
   */
  clone(): Blackboard {
    const copy = new Blackboard();
    copy._facts = this._facts.slice();
    for (const [predicate, bucket] of this._byPredicate) {
      copy._byPredicate.set(predicate, bucket.slice());
    }
    copy._counts = new Map(this._counts);
    copy._hashLo = this._hashLo;
    copy._hashHi = this._hashHi;
    return copy;
  }

  private _changed(): void {
    this._snapshot = null;
    this._version++;
  }

  /** Final avalanche over the running multiset sums (plus size, so {} != {x, x^-1}). */
  private _mixedState(): [number, number] {
    return hashString(`${this._hashLo}:${this._hashHi}:${this._facts.length}`);
  }
}
