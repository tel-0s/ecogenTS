import { ExecutableMove } from './DesignMove';
import { Blackboard } from './Blackboard';

/**
 * Random number generator interface for consistent usage across strategies.
 */
export interface RandomGenerator {
  /**
   * Returns a random number between 0 (inclusive) and 1 (exclusive).
   */
  random(): number;
  
  /**
   * Returns a random integer between min (inclusive) and max (exclusive).
   */
  randomInt(min: number, max: number): number;
  
  /**
   * Randomly selects an element from an array.
   */
  choice<T>(array: T[]): T;
}

/**
 * Simple random generator using Math.random or a seeded alternative.
 */
export class SimpleRandomGenerator implements RandomGenerator {
  private seed: number;
  
  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 0x7FFFFFFF);
  }
  
  /**
   * Simple linear congruential generator for deterministic randomness.
   */
  random(): number {
    // LCG parameters from Numerical Recipes
    this.seed = (this.seed * 1664525 + 1013904223) % 0x100000000;
    return this.seed / 0x100000000;
  }
  
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }
  
  choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    return array[this.randomInt(0, array.length)];
  }
}

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
    const combinedSeed = this.baseSeed ^ stateSeed; // Combine with base seed
    
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
    
    // Sort for deterministic ordering
    stableMoves.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    
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
