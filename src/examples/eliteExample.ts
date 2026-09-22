/**
 * Elite Example - Demonstrates Ecological Generative System
 * 
 * This implements the "Ecological Elite" example from Karth's dissertation,
 * showing how the classic Elite galaxy generation can be refactored from
 * a rigid pipeline into a flexible ecological system.
 */

import {
  DesignMove,
  Fact,
  Query,
  Bindings,
  Blackboard,
  EcologicalGenerator,
  RandomSelectionStrategy,
  DeterministicSelectionStrategy,
  DeterministicPrioritySelectionStrategy,
  SimpleRandomGenerator
} from '../index';

/**
 * Creates initial planet seeds when none exist.
 */
class MakePlanetSeedMove extends DesignMove {
  constructor(private maxPlanets: number = 8) {
    super('make-planet-seed', 10.0); // High priority to run first
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Only create seeds if we don't have too many planets
    const existingPlanets = blackboard.getFacts('planet').length;
    if (existingPlanets < this.maxPlanets) {
      yield { count: existingPlanets };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    // Id and randomness both come from the blackboard, so runs are reproducible.
    const planetIndex = blackboard.count('planet');
    const rng = blackboard.rng(['planet-seed', planetIndex]);
    const seed = rng.randomInt(0, 0xFFFFFFFF);
    const planetId = `planet_${planetIndex}`;

    return [
      new Fact('planet', [planetId]),
      new Fact('planet-seed', [planetId, seed])
    ];
  }
}

/**
 * Generates coordinates for planets that have seeds but no coordinates.
 */
class MakePlanetCoordinatesMove extends DesignMove {
  constructor() {
    super('make-planet-coordinates', 5.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Find planets with seeds but no coordinates
    for (const planetBinding of blackboard.query(new Query(['planet', '?planet_id']))) {
      const planetId = planetBinding.planet_id;

      // Check if this planet has a seed
      const seedQuery = new Query(['planet-seed', planetId, '?seed']);
      const seedBinding = blackboard.queryOne(seedQuery);
      if (seedBinding === null) {
        continue;
      }

      // Check if this planet already has coordinates
      const coordQuery = new Query(['planet-coordinates', planetId, '?x', '?y']);
      if (blackboard.queryOne(coordQuery) !== null) {
        continue;
      }

      yield {
        planet_id: planetId,
        seed: seedBinding.seed
      };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const planetId = bindings.planet_id;
    const seed = bindings.seed as number;

    // Use seed to generate deterministic coordinates
    const rng = new SimpleRandomGenerator(seed);
    const x = rng.randomInt(0, 256);
    const y = rng.randomInt(0, 256);

    return [new Fact('planet-coordinates', [planetId, x, y])];
  }
}

/**
 * Generates government type for planets with seeds but no government.
 */
class MakePlanetGovernmentMove extends DesignMove {
  private governmentTypes = [
    'anarchy', 'feudal', 'multi-government', 'dictatorship',
    'communist', 'confederacy', 'democracy', 'corporate-state'
  ];

  constructor() {
    super('make-planet-government', 5.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    for (const planetBinding of blackboard.query(new Query(['planet', '?planet_id']))) {
      const planetId = planetBinding.planet_id;

      // Check if this planet has a seed
      const seedQuery = new Query(['planet-seed', planetId, '?seed']);
      const seedBinding = blackboard.queryOne(seedQuery);
      if (seedBinding === null) {
        continue;
      }

      // Check if this planet already has a government
      const govQuery = new Query(['planet-government', planetId, '?gov']);
      if (blackboard.queryOne(govQuery) !== null) {
        continue;
      }

      yield {
        planet_id: planetId,
        seed: seedBinding.seed
      };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const planetId = bindings.planet_id;
    const seed = bindings.seed as number;

    // Use seed to generate deterministic government
    const rng = new SimpleRandomGenerator(seed + 1); // Offset for different randomness
    const government = rng.choice(this.governmentTypes);

    return [new Fact('planet-government', [planetId, government])];
  }
}

/**
 * Generates economy type based on government and seed.
 */
class MakePlanetEconomyMove extends DesignMove {
  private economyTypes = [
    'rich-industrial', 'average-industrial', 'poor-industrial',
    'mainly-industrial', 'mainly-agricultural', 'rich-agricultural',
    'average-agricultural', 'poor-agricultural'
  ];

  constructor() {
    super('make-planet-economy', 3.0); // Lower priority, depends on government
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    for (const planetBinding of blackboard.query(new Query(['planet', '?planet_id']))) {
      const planetId = planetBinding.planet_id;

      // Need both seed and government
      const seedQuery = new Query(['planet-seed', planetId, '?seed']);
      const seedBinding = blackboard.queryOne(seedQuery);
      if (seedBinding === null) {
        continue;
      }

      const govQuery = new Query(['planet-government', planetId, '?government']);
      const govBinding = blackboard.queryOne(govQuery);
      if (govBinding === null) {
        continue;
      }

      // Check if economy already exists
      const econQuery = new Query(['planet-economy', planetId, '?economy']);
      if (blackboard.queryOne(econQuery) !== null) {
        continue;
      }

      yield {
        planet_id: planetId,
        seed: seedBinding.seed,
        government: govBinding.government
      };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const planetId = bindings.planet_id;
    const seed = bindings.seed as number;
    const government = bindings.government as string;

    // Economy influenced by both seed and government
    const rng = new SimpleRandomGenerator(seed + 2);

    // Government affects economy probability
    let economyWeights: number[];
    if (government === 'corporate-state' || government === 'democracy') {
      // More likely to be industrial
      economyWeights = [3, 2, 1, 2, 1, 1, 1, 1];
    } else if (government === 'feudal' || government === 'anarchy') {
      // More likely to be poor
      economyWeights = [1, 1, 3, 1, 1, 1, 1, 3];
    } else {
      economyWeights = new Array(this.economyTypes.length).fill(1);
    }

    // Weighted random selection
    const totalWeight = economyWeights.reduce((a, b) => a + b, 0);
    let random = rng.random() * totalWeight;
    let economy = this.economyTypes[0];
    
    for (let i = 0; i < this.economyTypes.length; i++) {
      random -= economyWeights[i];
      if (random <= 0) {
        economy = this.economyTypes[i];
        break;
      }
    }

    return [new Fact('planet-economy', [planetId, economy])];
  }
}

/**
 * Creates a special starter planet with predefined properties (demonstrates authored content).
 */
class CreateStarterPlanetMove extends DesignMove {
  private created = false;

  constructor() {
    super('create-starter-planet', 20.0); // Highest priority
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Only run if no planets exist and we haven't created the starter yet
    if (!this.created && blackboard.getFacts('planet').length === 0) {
      yield { create: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    this.created = true;
    const starterId = 'starter_planet';

    return [
      new Fact('planet', [starterId]),
      new Fact('planet-coordinates', [starterId, 128, 128]), // Center of map
      new Fact('planet-government', [starterId, 'democracy']),
      new Fact('planet-economy', [starterId, 'rich-industrial']),
      new Fact('planet-population', [starterId, 'high']),
      new Fact('starter-planet', [starterId]) // Special marker
    ];
  }
}

/**
 * Generates trade routes between planets based on distance and economy.
 */
class GenerateTradeRoutesMove extends DesignMove {
  constructor(private maxDistance: number = 50.0) {
    super('generate-trade-routes', 1.0); // Low priority, runs after basics
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Find pairs of planets with coordinates and economies but no trade route between them
    const planetsWithCoords: Array<{
      planet: string;
      x: number;
      y: number;
      economy: string;
    }> = [];

    for (const coordBinding of blackboard.query(new Query(['planet-coordinates', '?planet', '?x', '?y']))) {
      const planetId = coordBinding.planet as string;

      // Check if this planet has an economy
      const econQuery = new Query(['planet-economy', planetId, '?economy']);
      const econBinding = blackboard.queryOne(econQuery);
      if (econBinding !== null) {
        planetsWithCoords.push({
          planet: planetId,
          x: coordBinding.x as number,
          y: coordBinding.y as number,
          economy: econBinding.economy as string
        });
      }
    }

    // Generate pairs
    for (let i = 0; i < planetsWithCoords.length; i++) {
      for (let j = i + 1; j < planetsWithCoords.length; j++) {
        const planet1 = planetsWithCoords[i];
        const planet2 = planetsWithCoords[j];

        // Check distance
        const dx = planet1.x - planet2.x;
        const dy = planet1.y - planet2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= this.maxDistance) {
          // Check if trade route already exists
          const routeQuery1 = new Query(['trade-route', planet1.planet, planet2.planet, '?profit']);
          const routeQuery2 = new Query(['trade-route', planet2.planet, planet1.planet, '?profit']);

          if (blackboard.queryOne(routeQuery1) === null &&
              blackboard.queryOne(routeQuery2) === null) {
            yield {
              planet1: planet1.planet,
              planet2: planet2.planet,
              economy1: planet1.economy,
              economy2: planet2.economy,
              distance: distance
            };
          }
        }
      }
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const planet1 = bindings.planet1 as string;
    const planet2 = bindings.planet2 as string;
    const economy1 = bindings.economy1 as string;
    const economy2 = bindings.economy2 as string;
    const distance = bindings.distance as number;

    // Calculate profitability based on economy types and distance
    let profitBase = 0;
    if (economy1.includes('industrial') && economy2.includes('agricultural')) {
      profitBase = 80;
    } else if (economy1.includes('agricultural') && economy2.includes('industrial')) {
      profitBase = 80;
    } else if (economy1 !== economy2) {
      profitBase = 40;
    } else {
      profitBase = 20;
    }

    // Distance reduces profit
    const profit = Math.max(10, profitBase - Math.floor(distance));

    return [new Fact('trade-route', [planet1, planet2, profit])];
  }
}

/**
 * Creates an Elite-style galaxy generator using the ecological approach.
 */
export function createEliteGenerator(
  useStarterPlanet: boolean = true,
  deterministic: boolean = false,
  seed: number = 42,
  maxPlanets: number = 8
): EcologicalGenerator {
  let selectionStrategy;
  if (deterministic) {
    // Use deterministic priority-based selection for more predictable results
    selectionStrategy = new DeterministicPrioritySelectionStrategy(seed);
  } else {
    // Use random selection with a seed for reproducibility
    selectionStrategy = new RandomSelectionStrategy(seed);
  }

  const generator = new EcologicalGenerator(selectionStrategy);

  // Add design moves
  if (useStarterPlanet) {
    generator.addDesignMove(new CreateStarterPlanetMove());
  }

  generator.addDesignMove(new MakePlanetSeedMove(maxPlanets));
  generator.addDesignMove(new MakePlanetCoordinatesMove());
  generator.addDesignMove(new MakePlanetGovernmentMove());
  generator.addDesignMove(new MakePlanetEconomyMove());
  generator.addDesignMove(new GenerateTradeRoutesMove());

  return generator;
}

/**
 * Renders the generated galaxy as a human-readable string.
 */
export function renderGalaxy(blackboard: Blackboard): string {
  const output: string[] = ['=== ELITE GALAXY ===\n'];

  const planets = blackboard.getFacts('planet');
  if (planets.length === 0) {
    return 'No planets generated.';
  }

  for (const planetFact of planets) {
    const planetId = planetFact.args[0];
    output.push(`Planet: ${planetId}`);

    // Get coordinates
    const coordQuery = new Query(['planet-coordinates', planetId, '?x', '?y']);
    const coordBinding = blackboard.queryOne(coordQuery);
    if (coordBinding) {
      output.push(`  Coordinates: (${coordBinding.x}, ${coordBinding.y})`);
    }

    // Get government
    const govQuery = new Query(['planet-government', planetId, '?gov']);
    const govBinding = blackboard.queryOne(govQuery);
    if (govBinding) {
      output.push(`  Government: ${govBinding.gov}`);
    }

    // Get economy
    const econQuery = new Query(['planet-economy', planetId, '?economy']);
    const econBinding = blackboard.queryOne(econQuery);
    if (econBinding) {
      output.push(`  Economy: ${econBinding.economy}`);
    }

    // Check if starter planet
    if (blackboard.hasFact('starter-planet', planetId)) {
      output.push('  [STARTER PLANET]');
    }

    output.push('');
  }

  // Show trade routes
  const tradeRoutes = blackboard.getFacts('trade-route');
  if (tradeRoutes.length > 0) {
    output.push('=== TRADE ROUTES ===');
    for (const route of tradeRoutes) {
      const [planet1, planet2, profit] = route.args;
      output.push(`${planet1} <-> ${planet2} (Profit: ${profit})`);
    }
  }

  return output.join('\n');
}

/**
 * Command line interface for Elite galaxy generation.
 */
export function main(): void {
  const { program } = require('commander');

  program
    .name('ecogen-elite')
    .description('Generate Elite galaxy using Ecological Generative System')
    .option('-d, --deterministic', 'Use deterministic execution (same seed always produces same result)')
    .option('-s, --seed <number>', 'Seed for generation', '42')
    .option('--no-starter', 'Generate without starter planet')
    .option('--max-steps <number>', 'Maximum generation steps', '50')
    .option('--max-planets <number>', 'Maximum number of planets', '8')
    .option('-c, --compare', 'Compare deterministic vs non-deterministic runs')
    .option('-v, --verbose', 'Show detailed execution log');

  program.parse();
  const options = program.opts();

  const seed = parseInt(options.seed);
  const maxSteps = parseInt(options.maxSteps);
  const maxPlanets = parseInt(options.maxPlanets);

  if (options.compare) {
    console.log('=== COMPARISON: Deterministic vs Non-Deterministic ===\n');

    console.log('1. DETERMINISTIC RUN (same seed will always produce same result):');
    console.log('-'.repeat(70));
    const detGenerator = createEliteGenerator(
      options.starter,
      true,
      seed,
      maxPlanets
    );
    const detBlackboard = detGenerator.generate(maxSteps);
    console.log(renderGalaxy(detBlackboard));

    console.log('\n' + '='.repeat(70) + '\n');

    console.log('2. NON-DETERMINISTIC RUN (random selection):');
    console.log('-'.repeat(70));
    const randGenerator = createEliteGenerator(
      options.starter,
      false,
      seed,
      maxPlanets
    );
    const randBlackboard = randGenerator.generate(maxSteps);
    console.log(renderGalaxy(randBlackboard));

    console.log('\n3. RUNNING DETERMINISTIC AGAIN (should be identical to run 1):');
    console.log('-'.repeat(70));
    const det2Generator = createEliteGenerator(
      options.starter,
      true,
      seed,
      maxPlanets
    );
    const det2Blackboard = det2Generator.generate(maxSteps);
    console.log(renderGalaxy(det2Blackboard));

    if (options.verbose) {
      const det1Log = detGenerator.orchestrator?.executionLog || [];
      const det2Log = det2Generator.orchestrator?.executionLog || [];
      
      console.log(`\nDeterministic runs identical: ${JSON.stringify(det1Log) === JSON.stringify(det2Log)}`);
      console.log(`Det1 facts: ${detBlackboard.facts.length}, Det2 facts: ${det2Blackboard.facts.length}`);
    }
  } else {
    // Single run
    const mode = options.deterministic ? 'DETERMINISTIC' : 'NON-DETERMINISTIC';
    console.log(`Generating Elite galaxy using Ecological Generative System (${mode})...\n`);

    // Create and run the generator
    const generator = createEliteGenerator(
      options.starter,
      options.deterministic,
      seed,
      maxPlanets
    );
    const blackboard = generator.generate(maxSteps);

    // Render the result
    console.log(renderGalaxy(blackboard));

    // Show execution log
    if (options.verbose) {
      const summary = generator.getExecutionSummary();
      if (summary) {
        console.log('\n=== EXECUTION LOG ===');
        console.log(summary);
      }
    }

    const factTypes = new Set(blackboard.facts.map(f => f.predicate));
    console.log(`\nTotal facts generated: ${blackboard.facts.length}`);
    console.log(`Fact types: ${Array.from(factTypes).join(', ')}`);
    console.log(`Mode: ${options.deterministic ? 'Deterministic' : 'Non-deterministic'}`);
    console.log(`Seed: ${seed}`);

    if (options.deterministic) {
      console.log('\nNote: Running with the same seed will always produce identical results.');
    }
  }
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  main();
}
