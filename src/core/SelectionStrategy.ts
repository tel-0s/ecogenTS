import type { ExecutableMove } from './DesignMove.js';
import type { Blackboard } from './Blackboard.js';
import { SimpleRandomGenerator } from './random.js';
import type { RandomGenerator } from './random.js';

// Re-exported for backwards compatibility; these now live in ./random.
export type { RandomGenerator } from './random.js';
export { SimpleRandomGenerator };

/**
 * Abstract base class for move selection strategies.
 * Determines which executable move to run next during generation.
 */
export abstract class SelectionStrategy {
  /**
   * Selects which executable move to run next.
   * @param executableMoves - List of moves that can be executed
   * @param blackboard - Current blackboard state
   * @returns The selected move, or null if no moves available
   */
  abstract select(
    executableMoves: ExecutableMove[],
    blackboard: Blackboard
  ): ExecutableMove | null;
}

/**
 * Selects moves randomly with equal probability.
 */
export class RandomSelectionStrategy extends SelectionStrategy {
  private rng: RandomGenerator;
  
  constructor(seed?: number) {
    super();
    this.rng = new SimpleRandomGenerator(seed);
  }
  
  select(executableMoves: ExecutableMove[], blackboard: Blackboard): ExecutableMove | null {
    if (executableMoves.length === 0) {
      return null;
    }
    return this.rng.choice(executableMoves);
  }
}

/**
 * Selects moves based on priority, with random tiebreaking.
 * Higher priority moves are always selected over lower priority ones.
 */
export class PrioritySelectionStrategy extends SelectionStrategy {
  private rng: RandomGenerator;
  
  constructor(seed?: number) {
    super();
    this.rng = new SimpleRandomGenerator(seed);
  }
  
  select(executableMoves: ExecutableMove[], blackboard: Blackboard): ExecutableMove | null {
    if (executableMoves.length === 0) {
      return null;
    }
    
    // Find the highest priority
    const maxPriority = Math.max(...executableMoves.map(move => move.move.priority));
    
    // Filter to only the highest priority moves
    const highestPriorityMoves = executableMoves.filter(
      move => move.move.priority === maxPriority
    );
    
    // Random selection among highest priority
    return this.rng.choice(highestPriorityMoves);
  }
}

/**
 * Deterministic selection strategy that uses blackboard state hashing.
 * This ensures that given the same initial conditions and design moves,
 * the generator will always produce the same output.
 */
export class DeterministicSelectionStrategy extends SelectionStrategy {
  constructor(private baseSeed: number = 0) {
    super();
  }
  
  select(executableMoves: ExecutableMove[], blackboard: Blackboard): ExecutableMove | null {
    if (executableMoves.length === 0) {
      return null;
    }
    
    // Get deterministic seed from blackboard state
    const stateSeed = blackboard.getStateSeed();
    const combinedSeed = (this.baseSeed ^ stateSeed) >>> 0; // Combine with base seed
    
    // Create a temporary random generator with the deterministic seed
    const rng = new SimpleRandomGenerator(combinedSeed);
    
    // Create a stable ordering of moves for deterministic selection
    // Sort by move name and binding values to ensure consistent ordering
    const stableMoves = executableMoves.map(move => {
      // Create a stable sort key from move name and bindings
      const bindingKey = JSON.stringify(move.bindings, Object.keys(move.bindings).sort());
      const sortKey = `${move.move.name}:${bindingKey}`;
      return { sortKey, move };
    });
    
    // Sort for deterministic ordering. Plain code-unit comparison, NOT
    // localeCompare, so the order is identical on every machine.
    stableMoves.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
    
    // Select using the seeded random generator
    const selected = rng.choice(stableMoves);
    return selected.move;
  }
}

/**
 * Deterministic priority-based selection with deterministic tiebreaking.
 * Selects highest priority moves first, but uses blackboard state hashing
 * for deterministic tiebreaking when multiple moves have the same priority.
 */
export class DeterministicPrioritySelectionStrategy extends SelectionStrategy {
  private deterministicSelector: DeterministicSelectionStrategy;
  
  constructor(baseSeed: number = 0) {
    super();
    this.deterministicSelector = new DeterministicSelectionStrategy(baseSeed);
  }
  
  select(executableMoves: ExecutableMove[], blackboard: Blackboard): ExecutableMove | null {
    if (executableMoves.length === 0) {
      return null;
    }
    
    // Find the highest priority
    const maxPriority = Math.max(...executableMoves.map(move => move.move.priority));
    
    // Filter to only the highest priority moves
    const highestPriorityMoves = executableMoves.filter(
      move => move.move.priority === maxPriority
    );
    
    if (highestPriorityMoves.length === 1) {
      return highestPriorityMoves[0];
    }
    
    // Use deterministic selection for tiebreaking
    return this.deterministicSelector.select(highestPriorityMoves, blackboard);
  }
}
