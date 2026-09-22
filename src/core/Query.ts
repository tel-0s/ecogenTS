import { Fact } from './Fact.js';

/**
 * Variable bindings from a query match.
 * Maps variable names (without the '?' prefix) to their bound values.
 */
export type Bindings = Record<string, any>;

/**
 * Anything that can be used as a single-fact pattern:
 * a Query, a bare predicate string, or an array `[predicate, ...args]`.
 */
export type Pattern = Query | string | readonly [string, ...any[]];

/**
 * Represents a query pattern for matching facts on the blackboard.
 *
 * Variables start with '?' (e.g. "?name", "?x"). A variable used twice in the
 * same pattern (or already present in the incoming bindings) must match the
 * same value each time.
 *
 * Anonymous variables start with '?_' (e.g. "?_", "?_size"). They match any
 * value and are never bound, so several can appear in one pattern
 * independently. Use them for "don't care" positions:
 * `['planet-size', '?id', '?_']`.
 */
export class Query {
  public readonly predicate: string;
  public readonly args: readonly any[];

  /**
   * Creates a new Query.
   * @param pattern - Either a string predicate or an array [predicate, ...args]
   *                  where args can include variables starting with '?'
   */
  /**
   * Per argument: the variable name (without '?'), null for an anonymous
   * variable, or undefined for a literal. Precomputed so matching is cheap.
   */
  private readonly varNames: (string | null | undefined)[];

  constructor(pattern: string | readonly [string, ...any[]]) {
    if (typeof pattern === 'string') {
      this.predicate = pattern;
      this.args = [];
    } else {
      this.predicate = pattern[0];
      this.args = pattern.slice(1);
    }
    this.varNames = this.args.map(arg =>
      !Query.isVariable(arg) ? undefined : Query.isAnonymous(arg) ? null : arg.substring(1),
    );
  }

  /** Normalises any Pattern into a Query. */
  static from(pattern: Pattern): Query {
    return pattern instanceof Query ? pattern : new Query(pattern);
  }

  /** True if `arg` is a variable (a string starting with '?'). */
  static isVariable(arg: unknown): arg is string {
    return typeof arg === 'string' && arg.startsWith('?');
  }

  /** True if `arg` is an anonymous variable (a string starting with '?_'). */
  static isAnonymous(arg: unknown): boolean {
    return typeof arg === 'string' && arg.startsWith('?_');
  }

  /**
   * Checks if this query matches a fact, returning variable bindings if successful.
   * @param fact - The fact to match against
   * @param existingBindings - Optional existing bindings to respect
   * @returns Variable bindings if match succeeds, null otherwise
   */
  matches(fact: Fact, existingBindings?: Bindings): Bindings | null {
    // Predicate must match
    if (this.predicate !== fact.predicate) {
      return null;
    }

    // Argument count must match
    if (this.args.length !== fact.args.length) {
      return null;
    }

    // Pass 1: reject cheaply, without allocating. Literals must match, and
    // variables already bound by the caller must agree with the fact.
    const names = this.varNames;
    for (let i = 0; i < this.args.length; i++) {
      const name = names[i];
      if (name === undefined) {
        if (this.args[i] !== fact.args[i]) return null;
      } else if (name !== null && existingBindings && name in existingBindings) {
        if (existingBindings[name] !== fact.args[i]) return null;
      }
    }

    // Pass 2: bind the remaining variables.
    const bindings: Bindings = existingBindings ? { ...existingBindings } : {};
    for (let i = 0; i < this.args.length; i++) {
      const name = names[i];
      if (!name) continue; // literal (undefined) or anonymous (null)
      if (name in bindings) {
        if (bindings[name] !== fact.args[i]) return null; // repeated variable
      } else {
        bindings[name] = fact.args[i];
      }
    }
    return bindings;
  }

  /**
   * Substitutes bound variables into this pattern.
   * @returns The resulting argument list, and whether it is fully ground
   *          (contains no remaining variables).
   */
  substitute(bindings?: Bindings): { args: any[]; ground: boolean } {
    let ground = true;
    const args = this.args.map(arg => {
      if (!Query.isVariable(arg)) return arg;
      if (!Query.isAnonymous(arg) && bindings) {
        const name = arg.substring(1);
        if (name in bindings) return bindings[name];
      }
      ground = false;
      return arg;
    });
    return { args, ground };
  }

  /**
   * Returns a string representation of the query.
   */
  toString(): string {
    if (this.args.length === 0) {
      return `Query(${this.predicate})`;
    }
    const argsStr = this.args.map(arg => String(arg)).join(', ');
    return `Query([${this.predicate}, ${argsStr}])`;
  }
}
