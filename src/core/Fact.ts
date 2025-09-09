/**
 * Represents an (arti)fact on the blackboard - a piece of generated data.
 * Facts are the fundamental units of information in the ecological generative system.
 */
export class Fact {
  public readonly predicate: string;
  public readonly args: readonly any[];

  /**
   * Creates a new Fact.
   * @param predicate - The type/name of the fact (e.g., "planet", "distance")
   * @param args - The arguments/values associated with this fact
   */
  constructor(predicate: string, args: any[] | any) {
    this.predicate = predicate;
    
    // Ensure args is always a tuple (array)
    if (!Array.isArray(args)) {
      this.args = typeof args === 'string' || typeof args === 'number' || typeof args === 'boolean'
        ? [args]
        : [];
    } else {
      this.args = Object.freeze([...args]);
    }
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
   * Two facts are equal if they have the same predicate and arguments.
   */
  equals(other: Fact): boolean {
    if (this.predicate !== other.predicate) return false;
    if (this.args.length !== other.args.length) return false;
    
    for (let i = 0; i < this.args.length; i++) {
      if (this.args[i] !== other.args[i]) return false;
    }
    
    return true;
  }

  /**
   * Creates a JSON-serializable representation of the fact.
   * Useful for deterministic hashing.
   */
  toJSON(): [string, any[]] {
    return [this.predicate, [...this.args]];
  }
}
