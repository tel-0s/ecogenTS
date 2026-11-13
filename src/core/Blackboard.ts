import { Fact } from './Fact.js';
import { Query, Bindings, Pattern } from './Query.js';
import { hashString, hash32, toHex32 } from './hash.js';
import { SimpleRandomGenerator } from './random.js';

/**
 * What a piece of code read from a blackboard: the predicates it queried, each
 * with the version it had, and whether it read the whole board. Made by
 * {@link Blackboard.track}. While {@link Reads.fresh} is true, running the same
 * code again (if it reads nothing but the blackboard) gives the same result.
 */
export class Reads {
  /** predicate -> its version when first read */
  readonly predicates = new Map<string, number>();
  /** The board's version when code read the whole board (`facts`, `size`, `rng`...), else -1. */
  all = -1;

  /** True while nothing this code read has changed. */
  fresh(blackboard: Blackboard): boolean {
    if (this.all !== -1 && blackboard.version !== this.all) return false;
    for (const [predicate, version] of this.predicates) {
      if (blackboard.versionOf(predicate) !== version) return false;
    }
    return true;
  }

  /** True if the code read this predicate (or the whole board). */
  has(predicate: string): boolean {
    return this.all !== -1 || this.predicates.has(predicate);
  }
}

const NO_FACTS: ReadonlySet<Fact> = new Set();

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
 * - a query that binds an argument (a literal or an already-bound variable)
 *   uses a hash index on that argument position. Indexes are built the first
 *   time a query needs them and kept up to date after that;
 * - a fully ground pattern (no unbound variables) is an O(1) lookup;
 * - adding and removing a fact are O(1) plus the number of indexes on its predicate;
 * - the state hash is an order-independent multiset hash maintained
 *   incrementally, so {@link getStateHash} / {@link getStateSeed} are O(1).
 *
 * Query results come in insertion order, with or without an index.
 *
 * Do not mutate the blackboard while iterating one of its query generators.
 */
export class Blackboard {
  private _facts = new Set<Fact>();
  private _byPredicate = new Map<string, Set<Fact>>();
  /** Stored instances per fact key, oldest first (the blackboard is a multiset). */
  private _byKey = new Map<string, Fact[]>();
  /** predicate -> argument position -> value -> facts, in insertion order. */
  private _indexes = new Map<string, Map<number, Map<unknown, Set<Fact>>>>();
  private _predicateVersions = new Map<string, number>();
  private _trackers: Reads[] = [];
  private _snapshot: readonly Fact[] | null = null;
  private _hashLo = 0;
  private _hashHi = 0;
  private _version = 0;

  /**
   * All facts currently on the blackboard, in insertion order.
   * Returns a frozen snapshot; it is cached until the blackboard changes.
   */
  get facts(): readonly Fact[] {
    this._readAll();
    if (this._snapshot === null) {
      this._snapshot = Object.freeze([...this._facts]);
    }
    return this._snapshot;
  }

  /** Number of facts on the blackboard. */
  get size(): number {
    this._readAll();
    return this._facts.size;
  }

  /** Increments on every change. Useful for cheap dirty-checking. */
  get version(): number {
    return this._version;
  }

  /**
   * Increments whenever a fact of this predicate is added or removed.
   * Never decreases, even when the last fact of the predicate goes.
   */
  versionOf(predicate: string): number {
    return this._predicateVersions.get(predicate) ?? 0;
  }

  /**
   * Runs `fn` and records what it read from this blackboard. Use it to cache a
   * result for as long as {@link Reads.fresh} holds. Only reads through this
   * blackboard's methods are recorded, so `fn` must not depend on anything else
   * that can change. Tracking nests: an outer `track` also records what an
   * inner one read.
   */
  track<T>(fn: () => T): { value: T; reads: Reads } {
    const reads = new Reads();
    this._trackers.push(reads);
    try {
      return { value: fn(), reads };
    } finally {
      this._trackers.splice(this._trackers.lastIndexOf(reads), 1);
    }
  }

  /**
   * Adds a new fact to the blackboard. Duplicates are allowed (the blackboard is a multiset).
   * @param fact - The fact to add
   */
  addFact(fact: Fact): void {
    // The same instance twice is two copies of the fact: store a twin.
    if (this._facts.has(fact)) fact = new Fact(fact.predicate, [...fact.args]);
    this._facts.add(fact);
    let bucket = this._byPredicate.get(fact.predicate);
    if (bucket === undefined) {
      bucket = new Set();
      this._byPredicate.set(fact.predicate, bucket);
    }
    bucket.add(fact);
    const copies = this._byKey.get(fact.key);
    if (copies === undefined) this._byKey.set(fact.key, [fact]);
    else copies.push(fact);
    const indexes = this._indexes.get(fact.predicate);
    if (indexes !== undefined) {
      for (const [position, index] of indexes) {
        const value = fact.args[position];
        let set = index.get(value);
        if (set === undefined) {
          set = new Set();
          index.set(value, set);
        }
        set.add(fact);
      }
    }
    const [lo, hi] = fact.hash;
    this._hashLo = (this._hashLo + lo) >>> 0;
    this._hashHi = (this._hashHi + hi) >>> 0;
    this._changed(fact.predicate);
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
    const copies = this._byKey.get(fact.key);
    if (copies === undefined) return false;

    // The oldest stored copy goes.
    const stored = copies.shift()!;
    if (copies.length === 0) this._byKey.delete(fact.key);
    const bucket = this._byPredicate.get(stored.predicate)!;
    bucket.delete(stored);
    if (bucket.size === 0) this._byPredicate.delete(stored.predicate);
    this._facts.delete(stored);
    const indexes = this._indexes.get(stored.predicate);
    if (indexes !== undefined) {
      for (const [position, index] of indexes) {
        const value = stored.args[position];
        const set = index.get(value);
        if (set === undefined) continue;
        set.delete(stored);
        if (set.size === 0) index.delete(value);
      }
    }

    const [lo, hi] = fact.hash;
    this._hashLo = (this._hashLo - lo) >>> 0;
    this._hashHi = (this._hashHi - hi) >>> 0;
    this._changed(stored.predicate);
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
    this._read(query.predicate);
    const doomed: Fact[] = [];
    for (const fact of this._candidates(query.predicate, query.substitute(bindings).args)) {
      if (query.matches(fact, bindings) !== null) doomed.push(fact);
    }
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
    this._read(query.predicate);

    // Fully ground pattern: O(1) lookup, one result per stored copy.
    const { args, ground } = query.substitute(bindings);
    if (ground) {
      const n = this._byKey.get(Fact.keyOf(query.predicate, args))?.length ?? 0;
      for (let i = 0; i < n; i++) yield bindings ? { ...bindings } : {};
      return;
    }

    for (const fact of this._candidates(query.predicate, args)) {
      const result = query.matches(fact, bindings);
      if (result !== null) yield result;
    }
  }

  /**
   * The facts a pattern can match: the smallest index bucket among its bound
   * argument positions, or every fact of the predicate when none is bound.
   * `args` is the pattern with bindings substituted.
   */
  private _candidates(predicate: string, args: readonly any[]): ReadonlySet<Fact> {
    const bucket = this._byPredicate.get(predicate);
    if (bucket === undefined) return NO_FACTS;
    let best: ReadonlySet<Fact> = bucket;
    for (let i = 0; i < args.length; i++) {
      if (Query.isVariable(args[i])) continue;
      const set = this._index(predicate, bucket, i).get(args[i]);
      if (set === undefined) return NO_FACTS;
      if (set.size < best.size) best = set;
    }
    return best;
  }

  /** The index on one argument position of a predicate, built on first use. */
  private _index(predicate: string, bucket: ReadonlySet<Fact>, position: number): Map<unknown, Set<Fact>> {
    let indexes = this._indexes.get(predicate);
    if (indexes === undefined) {
      indexes = new Map();
      this._indexes.set(predicate, indexes);
    }
    let index = indexes.get(position);
    if (index === undefined) {
      index = new Map();
      for (const fact of bucket) {
        const value = fact.args[position];
        let set = index.get(value);
        if (set === undefined) {
          set = new Set();
          index.set(value, set);
        }
        set.add(fact);
      }
      indexes.set(position, index);
    }
    return index;
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
      this._read(pattern);
      return this._byPredicate.get(pattern)?.size ?? 0;
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
    this._read(predicate);
    return this._byKey.has(Fact.keyOf(predicate, args));
  }

  /**
   * Gets all facts, optionally filtered by predicate.
   * @param predicate - Optional predicate to filter by
   * @returns A fresh array of facts
   */
  getFacts(predicate?: string): Fact[] {
    if (predicate === undefined) {
      this._readAll();
      return [...this._facts];
    }
    this._read(predicate);
    const bucket = this._byPredicate.get(predicate);
    return bucket ? [...bucket] : [];
  }

  /** All predicates currently present on the blackboard. */
  predicates(): string[] {
    this._readAll();
    return [...this._byPredicate.keys()];
  }

  /**
   * Deterministic hash of the current blackboard contents (16 hex digits).
   * Independent of insertion order; identical across platforms. O(1).
   */
  getStateHash(): string {
    this._readAll();
    const [a, b] = this._mixedState();
    return toHex32(a) + toHex32(b);
  }

  /**
   * Deterministic unsigned 32-bit seed derived from the blackboard contents. O(1).
   */
  getStateSeed(): number {
    this._readAll();
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
    return `Blackboard(${this._facts.size} facts)`;
  }

  /**
   * Returns a detailed string representation of the blackboard.
   */
  toDetailedString(): string {
    if (this._facts.size === 0) {
      return 'Blackboard:\n  (empty)';
    }
    const factsStr = [...this._facts].map(fact => `  ${fact.toString()}`).join('\n');
    return `Blackboard:\n${factsStr}`;
  }

  /**
   * Clears all facts from the blackboard.
   */
  clear(): void {
    const predicates = [...this._byPredicate.keys()];
    this._facts = new Set();
    this._byPredicate.clear();
    this._byKey.clear();
    this._indexes.clear();
    this._hashLo = 0;
    this._hashHi = 0;
    for (const predicate of predicates) this._bump(predicate);
    this._changed(null);
  }

  /**
   * Creates a copy of the blackboard. Facts are immutable, so they are shared.
   */
  clone(): Blackboard {
    const copy = new Blackboard();
    copy._facts = new Set(this._facts);
    for (const [predicate, bucket] of this._byPredicate) {
      copy._byPredicate.set(predicate, new Set(bucket));
    }
    for (const [key, copies] of this._byKey) copy._byKey.set(key, copies.slice());
    copy._hashLo = this._hashLo;
    copy._hashHi = this._hashHi;
    return copy;
  }

  private _changed(predicate: string | null): void {
    this._snapshot = null;
    this._version++;
    if (predicate !== null) this._bump(predicate);
  }

  private _bump(predicate: string): void {
    this._predicateVersions.set(predicate, (this._predicateVersions.get(predicate) ?? 0) + 1);
  }

  /** Records a read of one predicate in every active {@link track}. */
  private _read(predicate: string): void {
    for (const reads of this._trackers) {
      if (!reads.predicates.has(predicate)) reads.predicates.set(predicate, this.versionOf(predicate));
    }
  }

  /** Records a read of the whole board in every active {@link track}. */
  private _readAll(): void {
    for (const reads of this._trackers) {
      if (reads.all === -1) reads.all = this._version;
    }
  }

  /** Final avalanche over the running multiset sums (plus size, so {} != {x, x^-1}). */
  private _mixedState(): [number, number] {
    return hashString(`${this._hashLo}:${this._hashHi}:${this._facts.size}`);
  }
}
