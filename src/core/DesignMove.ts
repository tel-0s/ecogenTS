import { Fact } from './Fact';
import { Blackboard } from './Blackboard';
import { Bindings } from './Query';

/**
 * Abstract base class for design moves - the organisms of the ecosystem.
 * Each design move represents a self-contained generative operation with:
 * - A sensory query to find applicable patterns
 * - An execution function to generate new facts
 */
export abstract class DesignMove {
  /**
   * Creates a new DesignMove.
   * @param name - The name of this design move
   * @param priority - Priority for selection (higher = more likely to be selected)
   */
  constructor(
    public readonly name: string,
    public readonly priority: number = 1.0
  ) {}

  /**
   * The sensory query - finds patterns of facts this move can operate on.
   * @param blackboard - The current blackboard state
   * @returns An iterator of variable bindings for each applicable pattern
   */
  abstract sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings>;

  /**
   * The transformation execution function - generates new facts.
   * Takes the bound data from a successful query and returns new facts.
   * @param bindings - Variable bindings from the sensory query
   * @param blackboard - The current blackboard state
   * @returns Array of new facts to add to the blackboard
   */
  abstract execute(bindings: Bindings, blackboard: Blackboard): Fact[];

  /**
   * Checks if this design move can be executed given the current blackboard state.
   * @param blackboard - The current blackboard state
   * @returns True if at least one pattern matches
   */
  isExecutable(blackboard: Blackboard): boolean {
    const iterator = this.sensoryQuery(blackboard);
    const result = iterator.next();
    return !result.done;
  }

  /**
   * Gets all possible variable bindings for this move.
   * @param blackboard - The current blackboard state
   * @returns Array of all matching bindings
   */
  getAllBindings(blackboard: Blackboard): Bindings[] {
    return Array.from(this.sensoryQuery(blackboard));
  }

  /**
   * Returns a string representation of this design move.
   */
  toString(): string {
    return `DesignMove(${this.name}, priority=${this.priority})`;
  }
}

/**
 * Represents a design move with specific variable bindings ready for execution.
 */
export class ExecutableMove {
  /**
   * Creates an ExecutableMove.
   * @param move - The design move
   * @param bindings - The specific variable bindings
   */
  constructor(
    public readonly move: DesignMove,
    public readonly bindings: Bindings
  ) {}

  /**
   * Executes this move with its bound variables.
   * @param blackboard - The current blackboard state
   * @returns Array of new facts
   */
  execute(blackboard: Blackboard): Fact[] {
    return this.move.execute(this.bindings, blackboard);
  }

  /**
   * Returns a string representation of this executable move.
   */
  toString(): string {
    const bindingsStr = JSON.stringify(this.bindings);
    return `ExecutableMove(${this.move.name}, ${bindingsStr})`;
  }
}
