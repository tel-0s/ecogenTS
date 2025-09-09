import { createHash } from 'crypto';
import { Fact } from './Fact';
import { Query, Bindings } from './Query';

/**
 * Central shared data repository that holds all (arti)facts.
 * The blackboard is the core data structure of the ecological generative system.
 */
export class Blackboard {
  private _facts: Fact[] = [];

  /**
   * Gets all facts currently on the blackboard.
   */
  get facts(): readonly Fact[] {
    return this._facts;
  }

  /**
   * Adds a new fact to the blackboard.
   * @param fact - The fact to add
   */
  addFact(fact: Fact): void {
    this._facts.push(fact);
  }

  /**
   * Adds multiple facts to the blackboard.
   * @param facts - The facts to add
   */
  addFacts(facts: Fact[]): void {
    this._facts.push(...facts);
  }

  /**
   * Executes a query against the blackboard, yielding all matching bindings.
   * @param query - The query to execute
   * @returns An iterator of variable bindings for each match
   */
  *query(query: Query): IterableIterator<Bindings> {
    for (const fact of this._facts) {
      const bindings = query.matches(fact);
      if (bindings !== null) {
        yield bindings;
      }
    }
  }

  /**
   * Executes a query and returns the first matching binding, if any.
   * @param query - The query to execute
   * @returns The first matching binding or null
   */
  queryOne(query: Query): Bindings | null {
    for (const bindings of this.query(query)) {
      return bindings;
    }
    return null;
  }

  /**
   * Checks if a specific fact exists on the blackboard.
   * @param predicate - The predicate to check
   * @param args - The arguments to check
   * @returns True if the fact exists
   */
  hasFact(predicate: string, ...args: any[]): boolean {
    const targetFact = new Fact(predicate, args);
    return this._facts.some(fact => fact.equals(targetFact));
  }

  /**
   * Gets all facts, optionally filtered by predicate.
   * @param predicate - Optional predicate to filter by
   * @returns Array of facts
   */
  getFacts(predicate?: string): Fact[] {
    if (predicate === undefined) {
      return [...this._facts];
    }
    return this._facts.filter(fact => fact.predicate === predicate);
  }

  /**
   * Gets a deterministic hash of the current blackboard state.
   * Used for deterministic selection strategies.
   * @returns MD5 hash of the blackboard state
   */
  getStateHash(): string {
    // Create a sorted, serializable representation of all facts
    const factTuples = this._facts.map(fact => fact.toJSON());
    
    // Sort facts for deterministic ordering
    factTuples.sort((a, b) => {
      // First sort by predicate
      if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
      
      // Then by arguments
      const aStr = JSON.stringify(a[1]);
      const bStr = JSON.stringify(b[1]);
      return aStr.localeCompare(bStr);
    });

    // Create hash from serialized state
    const stateJson = JSON.stringify(factTuples);
    return createHash('md5').update(stateJson).digest('hex');
  }

  /**
   * Gets a deterministic integer seed based on blackboard state.
   * @returns A 32-bit integer derived from the state hash
   */
  getStateSeed(): number {
    const hash = this.getStateHash();
    // Convert first 8 characters of hash to integer
    return parseInt(hash.substring(0, 8), 16);
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
  }

  /**
   * Creates a deep copy of the blackboard.
   */
  clone(): Blackboard {
    const newBoard = new Blackboard();
    // Facts are immutable, so we can just copy references
    newBoard._facts = [...this._facts];
    return newBoard;
  }
}
