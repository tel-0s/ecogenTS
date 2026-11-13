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
   * True if the strategy only ever picks among the moves of the highest
   * priority present. The orchestrator then asks moves in priority order and
   * stops at the first priority that has an executable move, so lower moves
   * do not run their queries on that step. The list it passes keeps the
   * moves' original order.
   */
  readonly highestPriorityOnly: boolean = false;

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
  override readonly highestPriorityOnly = true;
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
 * Sort keys of executable moves, cached per bindings object. Memoized moves
 * hand the orchestrator the same bindings objects step after step, so each
 * key is computed once.
 */
const sortKeys = new WeakMap<object, { name: string; key: string }>();

function sortKeyOf(move: ExecutableMove): string {
  const bindings = move.bindings;
  const cached = sortKeys.get(bindings);
  if (cached !== undefined && cached.name === move.move.name) return cached.key;
  const key = `${move.move.name}:${JSON.stringify(bindings, Object.keys(bindings).sort())}`;
  sortKeys.set(bindings, { name: move.move.name, key });
  return key;
}

/**
 * The element that would be at index `k` if `items` were sorted by key
 * (plain code-unit order), found in O(n) on average instead of sorting.
 * Equal keys come from equal moves, so which of them is returned does not matter.
 */
function selectKth<T>(items: { key: string; item: T }[], k: number): T {
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const pivot = items[(lo + hi) >>> 1].key;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (items[i].key < pivot) i++;
      while (items[j].key > pivot) j--;
      if (i <= j) {
        const t = items[i];
        items[i] = items[j];
        items[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return items[k].item;
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
    
    // Order the moves by name and bindings, so the choice does not depend on
    // the order the moves came in. Plain code-unit comparison, NOT
    // localeCompare, so the order is identical on every machine. The seeded
    // random index picks a place in that order, and only that element is found.
    const keyed = executableMoves.map(move => ({ key: sortKeyOf(move), item: move }));
    return selectKth(keyed, rng.randomInt(0, keyed.length));
  }
}

/**
 * Deterministic priority-based selection with deterministic tiebreaking.
 * Selects highest priority moves first, but uses blackboard state hashing
 * for deterministic tiebreaking when multiple moves have the same priority.
 */
export class DeterministicPrioritySelectionStrategy extends SelectionStrategy {
  override readonly highestPriorityOnly = true;
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
