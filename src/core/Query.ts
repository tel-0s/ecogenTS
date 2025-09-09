import { Fact } from './Fact';

/**
 * Variable bindings from a query match.
 * Maps variable names (without the '?' prefix) to their bound values.
 */
export type Bindings = Record<string, any>;

/**
 * Represents a query pattern for matching facts on the blackboard.
 * Variables in patterns start with '?' (e.g., "?name", "?x", "?y").
 */
export class Query {
  public readonly predicate: string;
  public readonly args: readonly any[];

  /**
   * Creates a new Query.
   * @param pattern - Either a string predicate or an array [predicate, ...args]
   *                  where args can include variables starting with '?'
   */
  constructor(pattern: string | [string, ...any[]]) {
    if (typeof pattern === 'string') {
      this.predicate = pattern;
      this.args = [];
    } else {
      this.predicate = pattern[0];
      this.args = pattern.slice(1);
    }
  }

  /**
   * Checks if this query matches a fact, returning variable bindings if successful.
   * @param fact - The fact to match against
   * @param existingBindings - Optional existing bindings to respect
   * @returns Variable bindings if match succeeds, null otherwise
   */
  matches(fact: Fact, existingBindings?: Bindings): Bindings | null {
    const bindings = existingBindings ? { ...existingBindings } : {};

    // Predicate must match
    if (this.predicate !== fact.predicate) {
      return null;
    }

    // Argument count must match
    if (this.args.length !== fact.args.length) {
      return null;
    }

    // Check each argument
    for (let i = 0; i < this.args.length; i++) {
      const queryArg = this.args[i];
      const factArg = fact.args[i];

      if (typeof queryArg === 'string' && queryArg.startsWith('?')) {
        // This is a variable
        const varName = queryArg.substring(1); // Remove the '?' prefix
        
        if (varName in bindings) {
          // Variable already bound - check if it matches
          if (bindings[varName] !== factArg) {
            return null;
          }
        } else {
          // Bind the variable
          bindings[varName] = factArg;
        }
      } else {
        // This is a literal - must match exactly
        if (queryArg !== factArg) {
          return null;
        }
      }
    }

    return bindings;
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
