/**
 * EcogenTS - TypeScript implementation of the Ecological Generative System
 *
 * Based on Isaac Karth's dissertation "Recomposing Procgen" Chapter 12,
 * this implements an ecological approach to procedural generation using
 * a blackboard architecture with design moves and an orchestrator.
 *
 * The core has no runtime dependencies and runs in browsers, workers and Node.
 */

// Core types
export { Fact } from './core/Fact.js';
export { Query } from './core/Query.js';
export type { Bindings, Pattern } from './core/Query.js';
export { Blackboard } from './core/Blackboard.js';
export type { MatchOptions } from './core/Blackboard.js';

// Design moves
export { DesignMove, ExecutableMove, defineMove, normalizeMoveOutput } from './core/DesignMove.js';
export type { MoveResult, MoveOutput, MoveSpec } from './core/DesignMove.js';

// Selection strategies
export {
  SelectionStrategy,
  RandomSelectionStrategy,
  PrioritySelectionStrategy,
  DeterministicSelectionStrategy,
  DeterministicPrioritySelectionStrategy
} from './core/SelectionStrategy.js';

// Randomness and hashing
export { SimpleRandomGenerator } from './core/random.js';
export type { RandomGenerator } from './core/random.js';
export { hashString, hash32 } from './core/hash.js';

// Orchestrator
export { Orchestrator } from './core/Orchestrator.js';
export type { ExecutionLogEntry } from './core/Orchestrator.js';

// Main generator
export { EcologicalGenerator } from './core/EcologicalGenerator.js';
export type { Renderer } from './core/EcologicalGenerator.js';
