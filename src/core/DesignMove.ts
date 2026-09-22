import { Fact } from './Fact.js';
import { Blackboard, MatchOptions } from './Blackboard.js';
import { Bindings, Pattern } from './Query.js';

/**
 * The effect of executing a design move: facts to add and facts to remove.
 * Removals are applied before additions.
 */
export interface MoveResult {
  add?: Fact[];
  remove?: Fact[];
}

/**
 * What a design move's execute function may return: either a plain list of
 * facts to add (the common case), or a {@link MoveResult} that can also remove facts.
 */
export type MoveOutput = Fact[] | MoveResult;

/** Normalises a {@link MoveOutput} into a {@link MoveResult} with both lists present. */
export function normalizeMoveOutput(output: MoveOutput): Required<MoveResult> {
  if (Array.isArray(output)) return { add: output, remove: [] };
  return { add: output.add ?? [], remove: output.remove ?? [] };
}

/**
 * Abstract base class for design moves - the organisms of the ecosystem.
 * Each design move represents a self-contained generative operation with:
 * - A sensory query to find applicable patterns
 * - An execution function to generate new facts
 *
 * For reproducible output, keep all state on the blackboard: derive ids from
 * it (e.g. `blackboard.count('planet')`) and randomness from `blackboard.rng(...)`
 * rather than from fields on the move or `Math.random()`.
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
  abstract sensoryQuery(blackboard: Blackboard): Iterable<Bindings>;

  /**
   * The transformation execution function - generates new facts.
   * Takes the bound data from a successful query and returns new facts
   * (or a {@link MoveResult} that may also remove facts).
   * @param bindings - Variable bindings from the sensory query
   * @param blackboard - The current blackboard state
   */
  abstract execute(bindings: Bindings, blackboard: Blackboard): MoveOutput;

  /**
   * Checks if this design move can be executed given the current blackboard state.
   * @param blackboard - The current blackboard state
   * @returns True if at least one pattern matches
   */
  isExecutable(blackboard: Blackboard): boolean {
    const iterator = this.sensoryQuery(blackboard)[Symbol.iterator]();
    return !iterator.next().done;
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
 * Declarative specification for {@link defineMove}.
 */
export interface MoveSpec {
  name: string;
  priority?: number;
  /**
   * Either a list of patterns joined with {@link Blackboard.match}, or a custom
   * sensory function. An empty list matches once (use `where` to guard it).
   */
  query: readonly Pattern[] | ((blackboard: Blackboard) => Iterable<Bindings>);
  /** Negated patterns (only used when `query` is a pattern list). */
  not?: MatchOptions['not'];
  /** Extra filter on bindings (only used when `query` is a pattern list). */
  where?: MatchOptions['where'];
  execute: (bindings: Bindings, blackboard: Blackboard) => MoveOutput;
}

/**
 * Defines a design move from a plain object instead of a subclass.
 *
 * @example
 * const addSize = defineMove({
 *   name: 'planet-size',
 *   query: [['planet', '?id']],
 *   not: [['planet-size', '?id', '?_']],
 *   execute: ({ id }, bb) => [new Fact('planet-size', [id, bb.rng(['size', id]).choice(['small', 'large'])])],
 * });
 */
export function defineMove(spec: MoveSpec): DesignMove {
  const { query, not, where } = spec;
  return new (class extends DesignMove {
    sensoryQuery(blackboard: Blackboard): Iterable<Bindings> {
      if (typeof query === 'function') return query(blackboard);
      return blackboard.match(query, { not, where });
    }
    execute(bindings: Bindings, blackboard: Blackboard): MoveOutput {
      return spec.execute(bindings, blackboard);
    }
  })(spec.name, spec.priority ?? 1.0);
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
   */
  execute(blackboard: Blackboard): MoveOutput {
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
