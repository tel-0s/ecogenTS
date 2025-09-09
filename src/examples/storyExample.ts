/**
 * Story Generation Example - Demonstrates Ecological Generative System for Narrative
 * 
 * This example shows how EGS can be used for story generation, where narrative elements
 * can influence each other in flexible ways rather than following a rigid story pipeline.
 */

import {
  DesignMove,
  Fact,
  Query,
  Bindings,
  Blackboard,
  EcologicalGenerator,
  RandomSelectionStrategy,
  DeterministicPrioritySelectionStrategy,
  SimpleRandomGenerator
} from '../index';

/**
 * Creates a protagonist when none exists.
 */
class CreateProtagonistMove extends DesignMove {
  private created = false;
  private names = ['Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Taylor'];
  private traits = ['brave', 'cunning', 'wise', 'reckless', 'cautious', 'ambitious'];

  constructor() {
    super('create-protagonist', 10.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (!this.created && !blackboard.hasFact('protagonist')) {
      yield { create: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    this.created = true;

    // Use blackboard state for deterministic character generation
    const stateSeed = blackboard.getStateSeed();
    const rng = new SimpleRandomGenerator(stateSeed + 1);

    const name = rng.choice(this.names);
    const trait = rng.choice(this.traits);

    return [
      new Fact('protagonist', [name]),
      new Fact('character-trait', [name, trait])
    ];
  }
}

/**
 * Creates a setting for the story.
 */
class CreateSettingMove extends DesignMove {
  private created = false;
  private locations = [
    'ancient forest', 'bustling city', 'remote village',
    'mysterious castle', 'underground cavern', 'floating island'
  ];
  private atmospheres = [
    'mysterious', 'threatening', 'peaceful', 'chaotic', 'magical', 'grim'
  ];

  constructor() {
    super('create-setting', 9.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (!this.created && !blackboard.hasFact('setting')) {
      yield { create: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    this.created = true;

    const stateSeed = blackboard.getStateSeed();
    const rng = new SimpleRandomGenerator(stateSeed + 2);

    const location = rng.choice(this.locations);
    const atmosphere = rng.choice(this.atmospheres);

    return [
      new Fact('setting', [location]),
      new Fact('atmosphere', [location, atmosphere])
    ];
  }
}

/**
 * Introduces a conflict based on protagonist traits and setting.
 */
class IntroduceConflictMove extends DesignMove {
  private conflicts: Record<string, string[]> = {
    brave: ['dragon terrorizing the land', 'corrupt ruler oppressing people', 'ancient evil awakening'],
    cunning: ['mystery to solve', 'heist to pull off', 'political intrigue to navigate'],
    wise: ['prophecy to fulfill', 'young hero to mentor', 'ancient knowledge to protect'],
    reckless: ['dangerous adventure', 'forbidden love', 'reckless gamble'],
    cautious: ['hidden danger to uncover', 'careful investigation', 'slow-burning mystery'],
    ambitious: ['throne to claim', 'empire to build', 'goal to achieve at any cost']
  };

  constructor() {
    super('introduce-conflict', 5.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Need protagonist with trait and setting, but no conflict yet
    for (const protagonistBinding of blackboard.query(new Query(['protagonist', '?name']))) {
      const name = protagonistBinding.name;

      // Check for trait
      const traitQuery = new Query(['character-trait', name, '?trait']);
      const traitBinding = blackboard.queryOne(traitQuery);
      if (traitBinding === null) {
        continue;
      }

      // Check for setting
      const settingQuery = new Query(['setting', '?location']);
      const settingBinding = blackboard.queryOne(settingQuery);
      if (settingBinding === null) {
        continue;
      }

      // Check if conflict already exists
      if (blackboard.queryOne(new Query(['conflict', '?conflict'])) !== null) {
        continue;
      }

      yield {
        name: name,
        trait: traitBinding.trait,
        location: settingBinding.location
      };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const trait = bindings.trait as string;
    const location = bindings.location;

    const stateSeed = blackboard.getStateSeed();
    const rng = new SimpleRandomGenerator(stateSeed + 3);

    const possibleConflicts = this.conflicts[trait] || ['mysterious challenge'];
    const conflict = rng.choice(possibleConflicts);

    return [
      new Fact('conflict', [conflict]),
      new Fact('story-element', ['conflict', conflict, location])
    ];
  }
}

/**
 * Adds allies based on the type of conflict.
 */
class AddAllyMove extends DesignMove {
  private allyCounter = 0;
  private allies = [
    'wise mentor', 'loyal friend', 'mysterious stranger',
    'skilled warrior', 'clever thief', 'noble knight'
  ];

  constructor() {
    super('add-ally', 3.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Need conflict but not too many allies
    const conflictFacts = blackboard.getFacts('conflict');
    const allyFacts = blackboard.getFacts('ally');

    if (conflictFacts.length > 0 && allyFacts.length < 2) {
      for (const conflictFact of conflictFacts) {
        yield { conflict: conflictFact.args[0] };
      }
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const stateSeed = blackboard.getStateSeed();
    const rng = new SimpleRandomGenerator(stateSeed + 4 + this.allyCounter);

    const ally = rng.choice(this.allies);
    const allyId = `ally_${this.allyCounter}`;
    this.allyCounter++;

    return [
      new Fact('ally', [allyId, ally]),
      new Fact('story-element', ['ally', ally, 'joins the quest'])
    ];
  }
}

/**
 * Creates obstacles based on setting atmosphere.
 */
class CreateObstacleMove extends DesignMove {
  private obstacleCounter = 0;
  private obstacles: Record<string, string[]> = {
    mysterious: ['hidden trap', 'riddle to solve', 'illusion to see through'],
    threatening: ['dangerous beast', 'hostile guards', 'treacherous path'],
    peaceful: ['moral dilemma', 'difficult choice', 'competing loyalties'],
    chaotic: ['random disaster', 'unpredictable ally', 'changing rules'],
    magical: ['cursed artifact', 'spell gone wrong', 'magical barrier'],
    grim: ['betrayal', 'loss of hope', 'impossible odds']
  };

  constructor() {
    super('create-obstacle', 4.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    // Need setting with atmosphere and conflict, but not too many obstacles
    const obstacleFacts = blackboard.getFacts('obstacle');
    if (obstacleFacts.length >= 2) {
      return;
    }

    for (const atmosphereBinding of blackboard.query(new Query(['atmosphere', '?location', '?atmosphere']))) {
      // Check if there's a conflict
      if (blackboard.queryOne(new Query(['conflict', '?conflict'])) !== null) {
        yield {
          location: atmosphereBinding.location,
          atmosphere: atmosphereBinding.atmosphere
        };
      }
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const atmosphere = bindings.atmosphere as string;
    const location = bindings.location;

    const stateSeed = blackboard.getStateSeed();
    const rng = new SimpleRandomGenerator(stateSeed + 5 + this.obstacleCounter);

    const possibleObstacles = this.obstacles[atmosphere] || ['unexpected challenge'];
    const obstacle = rng.choice(possibleObstacles);

    const obstacleId = `obstacle_${this.obstacleCounter}`;
    this.obstacleCounter++;

    return [
      new Fact('obstacle', [obstacleId, obstacle]),
      new Fact('story-element', ['obstacle', obstacle, location])
    ];
  }
}

/**
 * Creates resolution when all story elements are in place.
 */
class ResolveStoryMove extends DesignMove {
  private created = false;
  private resolutions = [
    'hero triumph', 'pyrrhic victory', 'bittersweet ending',
    'unexpected twist', 'heroic sacrifice', 'wisdom gained'
  ];

  constructor() {
    super('resolve-story', 1.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (this.created) {
      return;
    }

    // Need protagonist, conflict, at least one ally or obstacle
    if (blackboard.queryOne(new Query(['protagonist', '?name'])) &&
        blackboard.queryOne(new Query(['conflict', '?conflict'])) &&
        (blackboard.getFacts('ally').length > 0 || blackboard.getFacts('obstacle').length > 0)) {
      yield { resolve: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    this.created = true;

    const stateSeed = blackboard.getStateSeed();
    const rng = new SimpleRandomGenerator(stateSeed + 6);

    const resolution = rng.choice(this.resolutions);

    return [
      new Fact('resolution', [resolution]),
      new Fact('story-element', ['resolution', resolution, 'the end'])
    ];
  }
}

/**
 * Creates a story generator using the ecological approach.
 */
export function createStoryGenerator(
  deterministic: boolean = false,
  seed: number = 42
): EcologicalGenerator {
  const selectionStrategy = deterministic
    ? new DeterministicPrioritySelectionStrategy(seed)
    : new RandomSelectionStrategy(seed);

  const generator = new EcologicalGenerator(selectionStrategy);

  // Add design moves in logical priority order
  generator.addDesignMove(new CreateProtagonistMove());
  generator.addDesignMove(new CreateSettingMove());
  generator.addDesignMove(new IntroduceConflictMove());
  generator.addDesignMove(new AddAllyMove());
  generator.addDesignMove(new CreateObstacleMove());
  generator.addDesignMove(new ResolveStoryMove());

  return generator;
}

/**
 * Renders the generated story as a narrative.
 */
export function renderStory(blackboard: Blackboard): string {
  const output: string[] = ['=== GENERATED STORY ===\n'];

  // Get protagonist
  const protagonistQuery = new Query(['protagonist', '?name']);
  const protagonistBinding = blackboard.queryOne(protagonistQuery);
  if (!protagonistBinding) {
    return 'No story generated.';
  }

  const protagonistName = protagonistBinding.name as string;

  // Get character trait
  const traitQuery = new Query(['character-trait', protagonistName, '?trait']);
  const traitBinding = blackboard.queryOne(traitQuery);
  const trait = traitBinding?.trait || 'mysterious';

  // Get setting and atmosphere
  const settingQuery = new Query(['setting', '?location']);
  const settingBinding = blackboard.queryOne(settingQuery);
  const location = settingBinding?.location || 'unknown place';

  const atmosphereQuery = new Query(['atmosphere', location, '?atmosphere']);
  const atmosphereBinding = blackboard.queryOne(atmosphereQuery);
  const atmosphere = atmosphereBinding?.atmosphere || 'strange';

  // Build narrative
  output.push(`In the ${atmosphere} ${location}, there lived a ${trait} person named ${protagonistName}.`);

  // Add conflict
  const conflictQuery = new Query(['conflict', '?conflict']);
  const conflictBinding = blackboard.queryOne(conflictQuery);
  if (conflictBinding) {
    const conflict = conflictBinding.conflict;
    output.push(`One day, ${protagonistName} faced a great challenge: ${conflict}.`);
  }

  // Add allies
  const allyFacts = blackboard.getFacts('ally');
  if (allyFacts.length > 0) {
    output.push(`Fortunately, ${protagonistName} was not alone:`);
    for (const allyFact of allyFacts) {
      const [allyName, allyType] = allyFact.args;
      output.push(`  • A ${allyType} joined the quest`);
    }
  }

  // Add obstacles
  const obstacleFacts = blackboard.getFacts('obstacle');
  if (obstacleFacts.length > 0) {
    output.push(`However, the journey was not easy. ${protagonistName} encountered:`);
    for (const obstacleFact of obstacleFacts) {
      const [obstacleName, obstacleType] = obstacleFact.args;
      output.push(`  • ${obstacleType}`);
    }
  }

  // Add resolution
  const resolutionQuery = new Query(['resolution', '?resolution']);
  const resolutionBinding = blackboard.queryOne(resolutionQuery);
  if (resolutionBinding) {
    const resolution = resolutionBinding.resolution;
    output.push(`In the end, the story concluded with a ${resolution}.`);
  }

  return output.join('\n');
}

/**
 * Command line interface for story generation.
 */
export function main(): void {
  const { program } = require('commander');

  program
    .name('ecogen-story')
    .description('Generate stories using Ecological Generative System')
    .option('-d, --deterministic', 'Use deterministic execution (same seed always produces same result)')
    .option('-s, --seed <number>', 'Seed for generation', '42')
    .option('--max-steps <number>', 'Maximum generation steps', '30')
    .option('-m, --multiple <number>', 'Generate multiple stories', '1')
    .option('-v, --verbose', 'Show detailed execution log');

  program.parse();
  const options = program.opts();

  const seed = parseInt(options.seed);
  const maxSteps = parseInt(options.maxSteps);
  const multiple = parseInt(options.multiple);

  for (let i = 0; i < multiple; i++) {
    if (multiple > 1) {
      console.log('\n' + '='.repeat(60));
      console.log(`STORY ${i + 1}`);
      console.log('='.repeat(60));
    }

    // Create and run the generator
    const generator = createStoryGenerator(
      options.deterministic,
      seed + i // Different seed for each story if generating multiple
    );
    const blackboard = generator.generate(maxSteps);

    // Render the result
    const story = renderStory(blackboard);
    console.log(story);

    // Show execution log
    if (options.verbose) {
      const summary = generator.getExecutionSummary();
      if (summary) {
        console.log('\n--- Execution Log ---');
        console.log(summary);
      }
    }

    console.log(`\nFacts generated: ${blackboard.facts.length}`);
    if (options.deterministic) {
      console.log(`Mode: Deterministic (seed: ${seed + i})`);
    } else {
      console.log(`Mode: Random (seed: ${seed + i})`);
    }
  }
}

// Run the CLI if this file is executed directly
if (require.main === module) {
  main();
}
