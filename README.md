# EcogenTS - TypeScript Ecological Generative System

[![TypeScript Version](https://img.shields.io/badge/typescript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-jest-green.svg)](https://jestjs.io/)

A TypeScript implementation of the Ecological Generative System (EGS) architecture described in Isaac Karth's dissertation "Recomposing Procgen" (Chapter 12). This library provides a flexible, modular alternative to rigid pipeline-based procedural generation.

## Overview

Instead of fixed, linear pipelines, EcogenTS models generation as an ecosystem of independent "design moves" that operate on a shared blackboard of facts. This approach enables:

- **Flexible execution order** - No predefined sequence of operations
- **Modular design** - Easy to add, remove, or modify generation steps  
- **Complex interdependencies** - Handles circular and non-linear relationships
- **Mixed-initiative generation** - Humans or AI can participate by adding facts or selecting moves
- **Dynamic systems** - Supports modification during generation
- **Type safety** - Full TypeScript support with comprehensive type definitions
- **Runs anywhere** - No runtime dependencies; works in browsers, workers and Node (CommonJS + ES modules)

## Core Architecture

The system consists of three main components:

### 1. Blackboard
The central data repository that stores all generated facts (artifacts). Facts are simple predicate-argument structures like `new Fact('planet', ['Earth'])` or `new Fact('distance', ['Earth', 'Mars', 50])`.

Facts are indexed by predicate, exact lookups are O(1), and the state hash is maintained incrementally, so blackboards with tens of thousands of facts stay fast. Facts can be added and removed.

### 2. Design Moves
Self-contained generative operations with two parts:
- **Sensory Query**: Searches the blackboard for patterns of facts to operate on
- **Execution Function**: Takes matched data and produces new facts

### 3. Orchestrator  
Manages the generation cycle by:
1. Finding executable design moves (those whose queries match current facts)
2. Selecting which move to execute next
3. Running the move and adding new facts to the blackboard
4. Repeating until no more moves can execute

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Benchmark (n = world size; add `det` for deterministic selection)
npm run build && node bench/bench.js ./dist 1000 det
```

## Quick Start

```typescript
import { defineMove, Fact, EcologicalGenerator } from 'ecogents';

// Create planets until there are three.
const createPlanet = defineMove({
  name: 'create-planet',
  priority: 5.0,
  query: [],                                     // no facts needed...
  where: (_b, bb) => bb.count('planet') < 3,     // ...but only while there are fewer than 3
  execute: (_b, bb) => [new Fact('planet', [`planet_${bb.count('planet')}`])],
});

// Give every planet without a size a size.
const sizePlanet = defineMove({
  name: 'size-planet',
  query: [['planet', '?id']],
  not: [['planet-size', '?id', '?_']],           // '?_' matches anything
  execute: ({ id }, bb) => [
    new Fact('planet-size', [id, bb.rng(['size', id]).choice(['small', 'medium', 'large'])]),
  ],
});

const generator = new EcologicalGenerator();
generator.addDesignMoves([createPlanet, sizePlanet]);

const blackboard = generator.generate();
blackboard.facts.forEach(fact => console.log(fact.toString()));
// (planet planet_0), (planet-size planet_0 large), (planet planet_1), ...
```

Moves can also be written as subclasses of `DesignMove` with a `sensoryQuery` generator and an `execute` method; see [Key Classes](#key-classes).

## Examples

### Elite Galaxy Generation

The library includes a complete reimplementation of the classic Elite galaxy generator using the ecological approach:

```typescript
import { createEliteGenerator, renderGalaxy } from './examples/eliteExample';

// Create an Elite-style generator
const generator = createEliteGenerator(
  true,  // use starter planet
  true,  // deterministic
  42,    // seed
  8      // max planets
);

// Generate a galaxy
const blackboard = generator.generate(50);

// Render the results
console.log(renderGalaxy(blackboard));
```

This demonstrates how the rigid Elite pipeline (seed → coordinates → government → economy) can be refactored into flexible design moves that can execute in any order as their dependencies become available.

### Simple World Building

```typescript
import { createSimpleWorldGenerator, renderSimpleWorld } from './examples/demo';

// Create a world generator
const generator = createSimpleWorldGenerator();

// Generate step by step
for (let step = 0; step < 10; step++) {
  if (!generator.step()) {
    break;
  }
  console.log(`Step ${step + 1}: ${generator.blackboard.facts.length} facts`);
}

// View the result
console.log(renderSimpleWorld(generator.blackboard));
```

### Story Generation

```typescript
import { createStoryGenerator, renderStory } from './examples/storyExample';

// Create a story generator
const generator = createStoryGenerator(true, 123); // deterministic, seed

// Generate a story
const blackboard = generator.generate(30);

// Render as narrative
console.log(renderStory(blackboard));
```

## Key Classes

### Fact
Represents a piece of generated data on the blackboard:
```typescript
const fact = new Fact('distance', ['Earth', 'Mars', 50]);
console.log(fact.toString()); // Output: (distance Earth Mars 50)
```

### Query
Pattern for matching a single fact with variable binding. Anywhere a query is
accepted you can also pass a plain array (`['planet', '?name']`) or a predicate string.
```typescript
const bindings = Array.from(blackboard.query(['planet', '?name']));
// [{ name: 'Earth' }, { name: 'Mars' }]
```

- `?name` binds a variable; using it twice means both positions must be equal.
- `?_` (or any `?_something`) is an anonymous wildcard: it matches anything and is not bound.

### Joins, negation and filters
`blackboard.match` joins several patterns, which covers what the thesis does with Datalog queries:
```typescript
// Every planet with each of its moons...
blackboard.match([['planet', '?p'], ['moon', '?p', '?m']]);

// ...planets that have no size yet (negation, like Datalog's `missing?`)...
blackboard.match([['planet', '?p']], { not: [['planet-size', '?p', '?_']] });

// ...or anything else, via an arbitrary filter.
blackboard.match([['planet', '?p']], { where: (b, bb) => bb.count(['moon', b.p, '?_']) > 1 });
```
Other helpers: `exists(pattern)`, `count(predicate | pattern)`, `queryOne(pattern)`, `hasFact(predicate, ...args)`.

### Removing facts
```typescript
blackboard.removeFact(new Fact('alive', ['wolf']));   // one instance
blackboard.retract(['alive', '?_']);                  // every match

// A design move may return { add, remove } instead of a list of facts.
// Removals are applied first and recorded in the execution log.
execute: ({ who }) => ({ remove: [new Fact('alive', [who])], add: [new Fact('shadow', [who])] })
```

### DesignMove
Base class for generation operations:
```typescript
class MyMove extends DesignMove {
  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Yield variable bindings for facts this move can process
    for (const binding of blackboard.query(new Query(['planet', '?name']))) {
      yield binding;
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    // Return new facts to add to blackboard
    const planetName = bindings.name;
    return [new Fact('planet-size', [planetName, 'medium'])];
  }
}
```

### Selection Strategies

Control which executable move runs next:

```typescript
import {
  RandomSelectionStrategy,
  PrioritySelectionStrategy,
  DeterministicSelectionStrategy,
  DeterministicPrioritySelectionStrategy
} from 'ecogents';

// Random selection
const generator = new EcologicalGenerator(new RandomSelectionStrategy(42));

// Priority-based selection (higher priority moves run first)
const generator = new EcologicalGenerator(new PrioritySelectionStrategy(42));

// Deterministic selection (same seed always produces identical results)
const generator = new EcologicalGenerator(new DeterministicSelectionStrategy(42));

// Deterministic priority-based selection with deterministic tiebreaking
const generator = new EcologicalGenerator(new DeterministicPrioritySelectionStrategy(42));
```

### Deterministic Execution

EcogenTS supports truly deterministic generation where the same initial conditions and seed will always produce identical results. This is achieved through blackboard state hashing as described in Karth's design notes:

```typescript
// Create two generators with the same deterministic strategy
const gen1 = new EcologicalGenerator(new DeterministicSelectionStrategy(123));
const gen2 = new EcologicalGenerator(new DeterministicSelectionStrategy(123));

// Add the same design moves to both
gen1.addDesignMove(new MyMove());
gen2.addDesignMove(new MyMove());

// Both will produce identical results
const result1 = gen1.generate();
const result2 = gen2.generate();
// result1.facts equals result2.facts
```

**Important**: For true determinism, keep all state on the blackboard:

- take randomness from `blackboard.rng(salt)`, never from `Math.random()`;
- derive ids from the blackboard (e.g. `blackboard.count('planet')`), never from counters stored on the move.

```typescript
// BAD: global randomness and state hidden on the move
execute(bindings, blackboard) {
  return [new Fact('tile', [this.counter++, Math.random()])];
}

// GOOD: everything derived from the blackboard
execute(bindings, blackboard) {
  const id = blackboard.count('tile');
  return [new Fact('tile', [id, blackboard.rng(['tile', id]).random()])];
}
```

The state hash is order-independent and identical on every platform (no Node `crypto`, no locale-sensitive sorting).

## Advanced Features

### Step-by-step Execution
```typescript
const generator = new EcologicalGenerator();
// ... add moves ...

while (generator.step()) {
  console.log(`Facts: ${generator.blackboard.facts.length}`);
  // Examine state, add facts, or modify moves
}
```

### Custom Renderers
```typescript
function myRenderer(blackboard: Blackboard): string {
  const planets = blackboard.getFacts('planet');
  return `Generated ${planets.length} planets`;
}

const result = generator.render(myRenderer);
```

### Execution Logging
```typescript
generator.generate();
const summary = generator.getExecutionSummary();
if (summary) {
  console.log(summary);
}
```

## Running the Examples

### From Command Line

```bash
# Run demos
npm run demo
npm run elite
npm run story

# Elite with options
npm run build && node dist/examples/eliteExample.js --deterministic --seed 123
npm run build && node dist/examples/eliteExample.js --compare

# Story with options  
npm run build && node dist/examples/storyExample.js --deterministic --multiple 3
```

### Command Line Options

**Elite Example:**
- `--deterministic, -d`: Use deterministic execution
- `--seed, -s SEED`: Set the seed for generation (default: 42)
- `--no-starter`: Generate without the starter planet
- `--max-steps STEPS`: Set maximum generation steps (default: 50)
- `--compare, -c`: Compare deterministic vs non-deterministic runs
- `--verbose, -v`: Show detailed execution log

**Story Example:**
- `--deterministic, -d`: Use deterministic execution
- `--seed, -s SEED`: Set the seed for generation (default: 42)
- `--max-steps STEPS`: Set maximum generation steps (default: 30)
- `--multiple, -m COUNT`: Generate multiple stories (default: 1)
- `--verbose, -v`: Show detailed execution log

## Comparison to Pipeline Approach

| Pipeline | Ecological |
|----------|------------|
| Fixed execution order | Dynamic, opportunistic execution |
| Rigid dependencies | Flexible interdependencies |
| Hard to modify | Modular, easy to extend |
| Sequential processing | Parallel possibility discovery |
| Author-driven | Data-driven |

## Use Cases

- **Game World Generation**: Complex worlds with interdependent systems
- **Story Generation**: Narrative elements that can influence each other
- **Mixed-Initiative Tools**: Human-AI collaborative generation
- **Meta-Generation**: Building generators that create other generators
- **Dynamic Content**: Systems that evolve during runtime

## API Reference

### Core Types

#### `Fact`
```typescript
class Fact {
  constructor(predicate: string, args: any[] | any);
  readonly predicate: string;
  readonly args: readonly any[];
  toString(): string;
  equals(other: Fact): boolean;
}
```

#### `Query`
```typescript
class Query {
  constructor(pattern: string | [string, ...any[]]);
  matches(fact: Fact, existingBindings?: Bindings): Bindings | null;
}
```

#### `Blackboard`
```typescript
type Pattern = Query | string | [string, ...any[]];

class Blackboard {
  readonly facts: readonly Fact[];      // frozen snapshot, insertion order
  readonly size: number;
  readonly version: number;             // increments on every change
  addFact(fact: Fact): void;
  addFacts(facts: Fact[]): void;
  removeFact(fact: Fact): boolean;
  removeFacts(facts: Fact[]): number;
  retract(pattern: Pattern, bindings?: Bindings): Fact[];
  query(pattern: Pattern, bindings?: Bindings): IterableIterator<Bindings>;
  queryOne(pattern: Pattern, bindings?: Bindings): Bindings | null;
  match(patterns: Pattern[], options?: { not?: Pattern[]; where?: (b, bb) => boolean; bindings?: Bindings }): IterableIterator<Bindings>;
  exists(pattern: Pattern, bindings?: Bindings): boolean;
  count(pattern: Pattern, bindings?: Bindings): number;
  hasFact(predicate: string, ...args: any[]): boolean;
  getFacts(predicate?: string): Fact[];
  getStateHash(): string;               // 16 hex digits
  getStateSeed(): number;               // unsigned 32-bit
  rng(salt?: unknown): SimpleRandomGenerator;
  clone(): Blackboard;
}
```

#### `DesignMove`
```typescript
type MoveOutput = Fact[] | { add?: Fact[]; remove?: Fact[] };

abstract class DesignMove {
  constructor(name: string, priority: number = 1.0);
  abstract sensoryQuery(blackboard: Blackboard): Iterable<Bindings>;
  abstract execute(bindings: Bindings, blackboard: Blackboard): MoveOutput;
}

function defineMove(spec: {
  name: string;
  priority?: number;
  query: Pattern[] | ((bb: Blackboard) => Iterable<Bindings>);
  not?: Pattern[];
  where?: (bindings: Bindings, bb: Blackboard) => boolean;
  execute: (bindings: Bindings, bb: Blackboard) => MoveOutput;
}): DesignMove;
```

#### `EcologicalGenerator`
```typescript
class EcologicalGenerator {
  constructor(selectionStrategy?: SelectionStrategy);
  addDesignMove(move: DesignMove): void;
  addInitialFacts(facts: Fact[]): void;
  generate(maxSteps?: number): Blackboard;
  step(): boolean;
  reset(): void;
  render<T>(renderer: (blackboard: Blackboard) => T): T;
}
```

## TypeScript Support

EcogenTS is written in TypeScript and provides full type definitions. All examples include proper type annotations and the library exports all necessary types for your own implementations.

## Contributing

This is a research implementation demonstrating the EGS architecture. Extensions and improvements are welcome, particularly:

- Additional selection strategies
- Incremental (Rete-style) matching, so moves are not re-queried every step
- Additional examples and use cases
- Better TypeScript generic support

## License

MIT License - see LICENSE file for details.

This implementation is based on the research described in Isaac Karth's dissertation "Recomposing Procgen". Please cite appropriately if using for academic purposes.
