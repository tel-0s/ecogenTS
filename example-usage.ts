/**
 * Example usage of the ecogenTS library
 * This demonstrates how to use the ecological generator system
 */

import {
  EcologicalGenerator,
  DesignMove,
  Fact,
  Query,
  Bindings,
  Blackboard,
  PrioritySelectionStrategy,
  DeterministicPrioritySelectionStrategy
} from './src/index';

// Example 1: Basic usage with custom design moves
console.log('=== Example 1: Basic Planet Generation ===\n');

class CreatePlanetMove extends DesignMove {
  private planetCount = 0;

  constructor() {
    super('create-planet', 5.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (blackboard.getFacts('planet').length < 3) {
      yield { create: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const planetName = `planet_${this.planetCount}`;
    this.planetCount++;
    return [new Fact('planet', [planetName])];
  }
}

const basicGenerator = new EcologicalGenerator();
basicGenerator.addDesignMove(new CreatePlanetMove());
const basicResult = basicGenerator.generate();

console.log('Generated facts:');
basicResult.facts.forEach(fact => console.log(`  ${fact.toString()}`));

// Example 2: Using the Elite galaxy generator
console.log('\n\n=== Example 2: Elite Galaxy Generation ===\n');

import { createEliteGenerator, renderGalaxy } from './src/examples/eliteExample';

const eliteGen = createEliteGenerator(
  true,  // use starter planet
  true,  // deterministic
  42,    // seed
  5      // max planets
);

const eliteResult = eliteGen.generate(50);
console.log(renderGalaxy(eliteResult));

// Example 3: Story generation
console.log('\n\n=== Example 3: Story Generation ===\n');

import { createStoryGenerator, renderStory } from './src/examples/storyExample';

const storyGen = createStoryGenerator(true, 123); // deterministic with seed
const storyResult = storyGen.generate(30);
console.log(renderStory(storyResult));

// Example 4: Step-by-step generation with monitoring
console.log('\n\n=== Example 4: Step-by-Step Generation ===\n');

import { createSimpleWorldGenerator } from './src/examples/demo';

const stepGen = createSimpleWorldGenerator();
console.log('Executing generation step by step:');

for (let i = 0; i < 10; i++) {
  if (!stepGen.step()) {
    console.log(`  Step ${i + 1}: No more moves can execute`);
    break;
  }
  
  const log = stepGen.orchestrator?.executionLog;
  if (log && log.length > 0) {
    const lastMove = log[log.length - 1];
    console.log(
      `  Step ${i + 1}: ${lastMove.moveName} -> ${lastMove.newFacts.length} new facts`
    );
  }
}

console.log(`\nFinal state: ${stepGen.blackboard.facts.length} total facts`);

// Example 5: Deterministic vs Non-deterministic comparison
console.log('\n\n=== Example 5: Deterministic Comparison ===\n');

// Create two deterministic generators with same seed
const det1 = new EcologicalGenerator(new DeterministicPrioritySelectionStrategy(999));
const det2 = new EcologicalGenerator(new DeterministicPrioritySelectionStrategy(999));

// Add same moves
class RandomValueMove extends DesignMove {
  constructor() {
    super('random-value', 1.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (!blackboard.hasFact('random-generated')) {
      yield { generate: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    // Use blackboard state for deterministic randomness
    const stateSeed = blackboard.getStateSeed();
    const value = (stateSeed % 100) + 1;
    return [
      new Fact('random-value', [value]),
      new Fact('random-generated', [true])
    ];
  }
}

det1.addDesignMove(new RandomValueMove());
det2.addDesignMove(new RandomValueMove());

const result1 = det1.generate();
const result2 = det2.generate();

console.log('Deterministic Generator 1:', result1.facts.map(f => f.toString()));
console.log('Deterministic Generator 2:', result2.facts.map(f => f.toString()));
console.log('Results identical:', 
  JSON.stringify(result1.facts) === JSON.stringify(result2.facts)
);

console.log('\n\nAll examples completed successfully!');
