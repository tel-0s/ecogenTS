/**
 * EcogenTS - TypeScript implementation of the Ecological Generative System
 * 
 * Based on Isaac Karth's dissertation "Recomposing Procgen" Chapter 12,
 * this implements an ecological approach to procedural generation using
 * a blackboard architecture with design moves and an orchestrator.
 */

// Core types
export { Fact } from './core/Fact';
export { Query, Bindings } from './core/Query';
export { Blackboard } from './core/Blackboard';

// Design moves
export { DesignMove, ExecutableMove } from './core/DesignMove';

// Selection strategies
export {
  SelectionStrategy,
  RandomSelectionStrategy,
  PrioritySelectionStrategy,
  DeterministicSelectionStrategy,
  DeterministicPrioritySelectionStrategy,
  RandomGenerator,
  SimpleRandomGenerator
} from './core/SelectionStrategy';

// Orchestrator
export { Orchestrator, ExecutionLogEntry } from './core/Orchestrator';

// Main generator
export { EcologicalGenerator, Renderer } from './core/EcologicalGenerator';
