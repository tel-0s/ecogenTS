/**
 * EcogenTS Demo - Simple demonstration of the Ecological Generative System
 * 
 * This script shows basic usage of the EGS library with a simple world-building example.
 */

import {
  DesignMove,
  Fact,
  Query,
  Bindings,
  Blackboard,
  EcologicalGenerator,
  PrioritySelectionStrategy
} from '../index';

/**
 * A simple design move that creates a basic world structure.
 */
class SimpleWorldMove extends DesignMove {
  private created = false;

  constructor() {
    super('create-world', 10.0); // High priority to run first
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (!this.created && !blackboard.hasFact('world')) {
      yield { create: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    this.created = true;
    return [
      new Fact('world', ['main_world']),
      new Fact('world-size', ['main_world', 'medium']),
      new Fact('world-climate', ['main_world', 'temperate'])
    ];
  }
}

/**
 * Adds cities to worlds that don't have enough.
 */
class AddCityMove extends DesignMove {
  constructor(private maxCities: number = 3) {
    super('add-city', 5.0); // Medium priority
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    for (const worldBinding of blackboard.query(new Query(['world', '?world_id']))) {
      const worldId = worldBinding.world_id;

      // Count existing cities in this world
      const cityFacts = blackboard.getFacts('city');
      const cityCount = cityFacts.filter(
        f => f.args.length >= 2 && f.args[1] === worldId
      ).length;

      if (cityCount < this.maxCities) {
        yield {
          world_id: worldId,
          current_cities: cityCount
        };
      }
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const worldId = bindings.world_id;
    // Derive the id from the blackboard (not a field on the move) so runs are reproducible.
    const cityId = `city_${blackboard.count('city')}`;

    // Get world climate to influence city type
    const climateQuery = new Query(['world-climate', worldId, '?climate']);
    const climateBinding = blackboard.queryOne(climateQuery);
    const climate = climateBinding?.climate || 'unknown';

    const cityType = climate === 'temperate' ? 'port' : 'mountain';

    return [
      new Fact('city', [cityId, worldId]),
      new Fact('city-type', [cityId, cityType]),
      new Fact('city-population', [cityId, 'small'])
    ];
  }
}

/**
 * Creates roads between cities in the same world.
 */
class ConnectCitiesMove extends DesignMove {
  constructor() {
    super('connect-cities', 1.0); // Low priority, runs after cities exist
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Find pairs of cities in the same world that aren't connected
    const citiesByWorld: Record<string, string[]> = {};

    for (const cityBinding of blackboard.query(new Query(['city', '?city_id', '?world_id']))) {
      const worldId = cityBinding.world_id as string;
      const cityId = cityBinding.city_id as string;

      if (!citiesByWorld[worldId]) {
        citiesByWorld[worldId] = [];
      }
      citiesByWorld[worldId].push(cityId);
    }

    for (const [worldId, cities] of Object.entries(citiesByWorld)) {
      for (let i = 0; i < cities.length; i++) {
        for (let j = i + 1; j < cities.length; j++) {
          const city1 = cities[i];
          const city2 = cities[j];

          // Check if road already exists (in either direction)
          const roadQuery1 = new Query(['road', city1, city2]);
          const roadQuery2 = new Query(['road', city2, city1]);

          if (blackboard.queryOne(roadQuery1) === null &&
              blackboard.queryOne(roadQuery2) === null) {
            yield {
              city1: city1,
              city2: city2,
              world: worldId
            };
          }
        }
      }
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const city1 = bindings.city1;
    const city2 = bindings.city2;

    return [new Fact('road', [city1, city2])];
  }
}

/**
 * Creates a simple world generator for demonstration.
 */
export function createSimpleWorldGenerator(): EcologicalGenerator {
  const generator = new EcologicalGenerator(
    new PrioritySelectionStrategy(123) // Seeded for reproducibility
  );

  generator.addDesignMove(new SimpleWorldMove());
  generator.addDesignMove(new AddCityMove(4)); // Max 4 cities
  generator.addDesignMove(new ConnectCitiesMove());

  return generator;
}

/**
 * Renders the simple world as a readable string.
 */
export function renderSimpleWorld(blackboard: Blackboard): string {
  const output: string[] = ['=== SIMPLE WORLD ===\n'];

  const worlds = blackboard.getFacts('world');
  if (worlds.length === 0) {
    return 'No worlds generated.';
  }

  for (const worldFact of worlds) {
    const worldId = worldFact.args[0];
    output.push(`World: ${worldId}`);

    // Get world properties
    const sizeQuery = new Query(['world-size', worldId, '?size']);
    const sizeBinding = blackboard.queryOne(sizeQuery);
    if (sizeBinding) {
      output.push(`  Size: ${sizeBinding.size}`);
    }

    const climateQuery = new Query(['world-climate', worldId, '?climate']);
    const climateBinding = blackboard.queryOne(climateQuery);
    if (climateBinding) {
      output.push(`  Climate: ${climateBinding.climate}`);
    }

    // Get cities
    output.push('  Cities:');
    const cityFacts = blackboard.getFacts('city')
      .filter(f => f.args.length >= 2 && f.args[1] === worldId);

    for (const cityFact of cityFacts) {
      const cityId = cityFact.args[0];

      // Get city properties
      const typeQuery = new Query(['city-type', cityId, '?type']);
      const typeBinding = blackboard.queryOne(typeQuery);
      const cityType = typeBinding?.type || 'unknown';

      const popQuery = new Query(['city-population', cityId, '?pop']);
      const popBinding = blackboard.queryOne(popQuery);
      const population = popBinding?.pop || 'unknown';

      output.push(`    - ${cityId} (${cityType}, ${population} population)`);
    }

    output.push('');
  }

  // Show roads
  const roads = blackboard.getFacts('road');
  if (roads.length > 0) {
    output.push('=== ROADS ===');
    for (const road of roads) {
      const [city1, city2] = road.args;
      output.push(`${city1} <-> ${city2}`);
    }
  }

  return output.join('\n');
}

/**
 * Main demo function.
 */
export function main(): void {
  console.log('=== EcogenTS Library Demo ===\n');

  // Demo 1: Simple World Generation
  console.log('1. Simple World Generation:');
  console.log('-'.repeat(40));

  const worldGen = createSimpleWorldGenerator();
  const worldBlackboard = worldGen.generate(20);

  console.log(renderSimpleWorld(worldBlackboard));

  const summary = worldGen.getExecutionSummary();
  if (summary) {
    console.log('\nExecution Summary:');
    console.log(summary);
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Demo 2: Step-by-step execution
  console.log('2. Step-by-step Execution Demo:');
  console.log('-'.repeat(40));

  const stepGen = createSimpleWorldGenerator();
  console.log(`Initial state: ${stepGen.blackboard.facts.length} facts`);

  for (let step = 0; step < 5; step++) {
    const executed = stepGen.step();
    if (!executed) {
      console.log(`Step ${step + 1}: No moves can be executed`);
      break;
    }
    console.log(`Step ${step + 1}: Executed move, now ${stepGen.blackboard.facts.length} facts`);

    const log = stepGen.orchestrator?.executionLog;
    if (log && log.length > 0) {
      const lastMove = log[log.length - 1];
      console.log(
        `  -> ${lastMove.moveName} with ${JSON.stringify(lastMove.bindings)} ` +
        `produced ${lastMove.newFacts.length} facts`
      );
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // Demo 3: Different selection strategies
  console.log('3. Selection Strategy Comparison:');
  console.log('-'.repeat(40));

  // Create generator with deterministic selection
  const deterministicGen = new EcologicalGenerator(
    new PrioritySelectionStrategy(42)
  );
  deterministicGen.addDesignMove(new SimpleWorldMove());
  deterministicGen.addDesignMove(new AddCityMove(3));
  deterministicGen.addDesignMove(new ConnectCitiesMove());

  const deterministicResult = deterministicGen.generate(20);
  console.log('Deterministic generation:');
  console.log(`  Generated ${deterministicResult.facts.length} facts`);
  console.log(`  Cities: ${deterministicResult.getFacts('city').length}`);
  console.log(`  Roads: ${deterministicResult.getFacts('road').length}`);
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main();
}
