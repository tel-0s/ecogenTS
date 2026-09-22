import {
  EcologicalGenerator,
  DesignMove,
  Fact,
  Query,
  Bindings,
  Blackboard,
  DeterministicSelectionStrategy
} from '../src/index';

// Test design move that creates planets
class TestPlanetMove extends DesignMove {
  private count = 0;

  constructor(private maxPlanets: number = 3) {
    super('test-planet', 1.0);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    if (blackboard.getFacts('planet').length < this.maxPlanets) {
      yield { create: true };
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    const planetId = `planet_${this.count}`;
    this.count++;
    return [new Fact('planet', [planetId])];
  }
}

// Test design move that adds size to planets
class TestPlanetSizeMove extends DesignMove {
  constructor() {
    super('test-planet-size', 0.5);
  }

  *sensoryQuery(blackboard: Blackboard): IterableIterator<Bindings> {
    for (const binding of blackboard.query(new Query(['planet', '?id']))) {
      const planetId = binding.id;
      // Only if planet doesn't have size yet. (hasFact needs exact args, and
      // planet-size facts carry a size too, so match that position with '?_'.)
      if (!blackboard.exists(['planet-size', planetId, '?_'])) {
        yield { planet_id: planetId };
      }
    }
  }

  execute(bindings: Bindings, blackboard: Blackboard): Fact[] {
    return [new Fact('planet-size', [bindings.planet_id, 'medium'])];
  }
}

describe('EcologicalGenerator', () => {
  test('should create generator with default selection strategy', () => {
    const generator = new EcologicalGenerator();
    expect(generator.blackboard).toBeDefined();
    expect(generator.designMoves).toEqual([]);
  });

  test('should add design moves', () => {
    const generator = new EcologicalGenerator();
    const move = new TestPlanetMove();
    
    generator.addDesignMove(move);
    expect(generator.designMoves).toHaveLength(1);
    expect(generator.designMoves[0]).toBe(move);
  });

  test('should add multiple design moves', () => {
    const generator = new EcologicalGenerator();
    const moves = [new TestPlanetMove(), new TestPlanetSizeMove()];
    
    generator.addDesignMoves(moves);
    expect(generator.designMoves).toHaveLength(2);
  });

  test('should remove design move', () => {
    const generator = new EcologicalGenerator();
    const move1 = new TestPlanetMove();
    const move2 = new TestPlanetSizeMove();
    
    generator.addDesignMoves([move1, move2]);
    const removed = generator.removeDesignMove('test-planet');
    
    expect(removed).toBe(true);
    expect(generator.designMoves).toHaveLength(1);
    expect(generator.designMoves[0].name).toBe('test-planet-size');
  });

  test('should add initial facts', () => {
    const generator = new EcologicalGenerator();
    const facts = [
      new Fact('setting', ['space']),
      new Fact('year', [2024])
    ];
    
    generator.addInitialFacts(facts);
    expect(generator.blackboard.facts).toHaveLength(2);
  });

  test('should generate facts', () => {
    const generator = new EcologicalGenerator();
    generator.addDesignMove(new TestPlanetMove(3));
    
    const blackboard = generator.generate(10);
    
    expect(blackboard.getFacts('planet')).toHaveLength(3);
    expect(generator.orchestrator).toBeDefined();
  });

  test('should execute step by step', () => {
    const generator = new EcologicalGenerator();
    generator.addDesignMove(new TestPlanetMove(2));
    
    expect(generator.blackboard.facts).toHaveLength(0);
    
    const step1 = generator.step();
    expect(step1).toBe(true);
    expect(generator.blackboard.facts).toHaveLength(1);
    
    const step2 = generator.step();
    expect(step2).toBe(true);
    expect(generator.blackboard.facts).toHaveLength(2);
    
    const step3 = generator.step();
    expect(step3).toBe(false); // No more moves can execute
  });

  test('should reset generator', () => {
    const generator = new EcologicalGenerator();
    generator.addDesignMove(new TestPlanetMove());
    generator.generate(5);
    
    expect(generator.blackboard.facts.length).toBeGreaterThan(0);
    
    generator.reset();
    expect(generator.blackboard.facts).toHaveLength(0);
    expect(generator.orchestrator).toBeNull();
  });

  test('should get facts with predicate filter', () => {
    const generator = new EcologicalGenerator();
    generator.addInitialFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars']),
      new Fact('star', ['Sun'])
    ]);
    
    expect(generator.getFacts('planet')).toHaveLength(2);
    expect(generator.getFacts('star')).toHaveLength(1);
    expect(generator.getFacts()).toHaveLength(3);
  });

  test('should use custom renderer', () => {
    const generator = new EcologicalGenerator();
    generator.addInitialFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars'])
    ]);
    
    const renderer = (blackboard: Blackboard) => {
      return `${blackboard.getFacts('planet').length} planets`;
    };
    
    const result = generator.render(renderer);
    expect(result).toBe('2 planets');
  });

  test('should support deterministic generation', () => {
    const strategy = new DeterministicSelectionStrategy(42);
    const gen1 = new EcologicalGenerator(strategy);
    const gen2 = new EcologicalGenerator(new DeterministicSelectionStrategy(42));
    
    // Add same moves
    gen1.addDesignMove(new TestPlanetMove(5));
    gen1.addDesignMove(new TestPlanetSizeMove());
    gen2.addDesignMove(new TestPlanetMove(5));
    gen2.addDesignMove(new TestPlanetSizeMove());
    
    // Generate
    const bb1 = gen1.generate(20);
    const bb2 = gen2.generate(20);
    
    // Should produce identical results
    expect(bb1.getStateHash()).toBe(bb2.getStateHash());
    expect(bb1.facts.length).toBe(bb2.facts.length);
  });

  test('should create snapshot', () => {
    const generator = new EcologicalGenerator();
    generator.addDesignMove(new TestPlanetMove(2));
    generator.generate(5);
    
    const snapshot = generator.snapshot();
    
    expect(snapshot.blackboard).toHaveLength(2);
    expect(snapshot.designMoves).toContain('test-planet');
    expect(snapshot.executionLog).toBeDefined();
    expect(Array.isArray(snapshot.executionLog)).toBe(true);
  });

  test('should get execution stats', () => {
    const generator = new EcologicalGenerator();
    generator.addDesignMove(new TestPlanetMove(3));
    generator.generate(10);
    
    const stats = generator.getExecutionStats();
    expect(stats).toBeDefined();
    expect(stats!['test-planet']).toBe(3);
  });

  test('should get execution summary', () => {
    const generator = new EcologicalGenerator();
    generator.addDesignMove(new TestPlanetMove(2));
    generator.generate(5);
    
    const summary = generator.getExecutionSummary();
    expect(summary).toBeDefined();
    expect(summary).toContain('Executed 2 moves');
  });

  test('should handle complex generation pipeline', () => {
    const generator = new EcologicalGenerator();
    
    // Add moves that depend on each other
    generator.addDesignMove(new TestPlanetMove(3));
    generator.addDesignMove(new TestPlanetSizeMove());
    
    const blackboard = generator.generate(20);
    
    // Should have planets and their sizes
    const planets = blackboard.getFacts('planet');
    const sizes = blackboard.getFacts('planet-size');
    
    expect(planets).toHaveLength(3);
    expect(sizes).toHaveLength(3); // Each planet should have a size
  });
});
