import * as fs from 'fs';
import * as path from 'path';
import {
  Blackboard,
  Fact,
  Query,
  defineMove,
  EcologicalGenerator,
  DeterministicSelectionStrategy,
  DeterministicPrioritySelectionStrategy,
  SimpleRandomGenerator,
  Bindings,
} from '../src/index';

const f = (predicate: string, ...args: any[]) => new Fact(predicate, args);

describe('Fact', () => {
  test('wraps a non-array object argument instead of dropping it', () => {
    expect(new Fact('meta', { a: 1 }).args).toEqual([{ a: 1 }]);
    expect(new Fact('none').args).toEqual([]);
  });

  test('equality is structural and matches the key', () => {
    expect(f('p', { x: 1 }).equals(f('p', { x: 1 }))).toBe(true);
    expect(f('p', 1).key).toBe(f('p', 1).key);
    expect(f('p', 1).key).not.toBe(f('p', '1').key);
  });
});

describe('Query', () => {
  test('anonymous variables match anything and are not bound', () => {
    const q = new Query(['edge', '?_', '?_']);
    expect(q.matches(f('edge', 'a', 'b'))).toEqual({});
  });

  test('named anonymous variables (?_foo) are also unbound', () => {
    const q = new Query(['size', '?id', '?_size']);
    expect(q.matches(f('size', 'earth', 3))).toEqual({ id: 'earth' });
  });

  test('repeated variables must agree', () => {
    const q = new Query(['edge', '?x', '?x']);
    expect(q.matches(f('edge', 'a', 'a'))).toEqual({ x: 'a' });
    expect(q.matches(f('edge', 'a', 'b'))).toBeNull();
  });

  test('existing bindings are respected and not mutated', () => {
    const q = new Query(['planet', '?name']);
    const existing = { name: 'Mars' };
    expect(q.matches(f('planet', 'Earth'), existing)).toBeNull();
    const result = q.matches(f('planet', 'Mars'), existing);
    expect(result).toEqual({ name: 'Mars' });
    expect(result).not.toBe(existing);
  });
});

describe('Blackboard indexing and lookup', () => {
  let bb: Blackboard;
  beforeEach(() => {
    bb = new Blackboard();
    bb.addFacts([
      f('planet', 'Earth'),
      f('planet', 'Mars'),
      f('size', 'Earth', 'medium'),
      f('moon', 'Earth', 'Luna'),
      f('moon', 'Mars', 'Phobos'),
      f('moon', 'Mars', 'Deimos'),
    ]);
  });

  test('facts getter returns a frozen, cached snapshot', () => {
    const a = bb.facts;
    expect(Object.isFrozen(a)).toBe(true);
    expect(bb.facts).toBe(a);
    bb.addFact(f('planet', 'Venus'));
    expect(bb.facts).not.toBe(a);
    expect(a).toHaveLength(6);
  });

  test('query uses bindings and supports ground lookups', () => {
    expect([...bb.query(['moon', '?p', '?m'], { p: 'Mars' })].map(b => b.m)).toEqual(['Phobos', 'Deimos']);
    expect(bb.exists(['size', 'Earth', '?_'])).toBe(true);
    expect(bb.exists(['size', 'Mars', '?_'])).toBe(false);
    expect(bb.exists(['planet', '?p'], { p: 'Earth' })).toBe(true);
  });

  test('ground lookups respect duplicates', () => {
    bb.addFact(f('planet', 'Earth'));
    expect(bb.count(['planet', 'Earth'])).toBe(2);
    expect(bb.count('planet')).toBe(3);
  });

  test('match joins patterns', () => {
    const results = [...bb.match([['planet', '?p'], ['moon', '?p', '?m']])];
    expect(results).toEqual([
      { p: 'Earth', m: 'Luna' },
      { p: 'Mars', m: 'Phobos' },
      { p: 'Mars', m: 'Deimos' },
    ]);
  });

  test('match supports negation and where', () => {
    const unsized = [...bb.match([['planet', '?p']], { not: [['size', '?p', '?_']] })];
    expect(unsized).toEqual([{ p: 'Mars' }]);

    const multiMoon = [...bb.match([['planet', '?p']], {
      where: (b, board) => board.count(['moon', b.p, '?_']) > 1,
    })];
    expect(multiMoon).toEqual([{ p: 'Mars' }]);
  });

  test('match with no patterns yields one empty binding', () => {
    expect([...bb.match([])]).toEqual([{}]);
    expect([...bb.match([], { where: () => false })]).toEqual([]);
  });

  test('removeFact removes one instance; retract removes all matches', () => {
    expect(bb.removeFact(f('planet', 'Pluto'))).toBe(false);
    expect(bb.removeFact(f('planet', 'Earth'))).toBe(true);
    expect(bb.hasFact('planet', 'Earth')).toBe(false);
    expect(bb.getFacts('planet')).toHaveLength(1);

    const removed = bb.retract(['moon', 'Mars', '?_']);
    expect(removed).toHaveLength(2);
    expect(bb.getFacts('moon')).toEqual([f('moon', 'Earth', 'Luna')]);
    expect(bb.facts).toHaveLength(3);
  });

  test('clone is independent', () => {
    const copy = bb.clone();
    copy.addFact(f('planet', 'Venus'));
    copy.removeFact(f('planet', 'Earth'));
    expect(bb.count('planet')).toBe(2);
    expect(bb.hasFact('planet', 'Earth')).toBe(true);
    expect(copy.hasFact('planet', 'Venus')).toBe(true);
  });
});

describe('State hashing', () => {
  test('is independent of insertion order', () => {
    const a = new Blackboard();
    const b = new Blackboard();
    a.addFacts([f('x', 1), f('y', 2), f('z', 3)]);
    b.addFacts([f('z', 3), f('x', 1), f('y', 2)]);
    expect(a.getStateHash()).toBe(b.getStateHash());
    expect(a.getStateHash()).toMatch(/^[0-9a-f]{16}$/);
  });

  test('returns to the same value after add + remove', () => {
    const bb = new Blackboard();
    bb.addFact(f('x', 1));
    const before = bb.getStateHash();
    bb.addFact(f('y', 2));
    expect(bb.getStateHash()).not.toBe(before);
    bb.removeFact(f('y', 2));
    expect(bb.getStateHash()).toBe(before);
  });

  test('distinguishes multiplicity', () => {
    const a = new Blackboard();
    const b = new Blackboard();
    a.addFact(f('x', 1));
    b.addFacts([f('x', 1), f('x', 1)]);
    expect(a.getStateHash()).not.toBe(b.getStateHash());
  });

  test('is stable across versions and platforms (golden value)', () => {
    const bb = new Blackboard();
    bb.addFacts([f('planet', 'Earth'), f('distance', 'Earth', 'Mars', 50)]);
    // If this changes, every seeded world changes: treat as a breaking change.
    expect(bb.getStateHash()).toBe(GOLDEN_STATE_HASH);
  });

  test('state seed is an unsigned 32-bit integer', () => {
    const bb = new Blackboard();
    for (let i = 0; i < 50; i++) {
      bb.addFact(f('n', i));
      const seed = bb.getStateSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe('Randomness', () => {
  test('any seed (negative, huge, fractional) produces values in [0, 1)', () => {
    for (const seed of [-1, -123456789, 2 ** 40, 0.5, 0, 0xffffffff]) {
      const rng = new SimpleRandomGenerator(seed);
      for (let i = 0; i < 100; i++) {
        const v = rng.random();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  test('blackboard.rng is reproducible and salt-sensitive', () => {
    const bb = new Blackboard();
    bb.addFact(f('seed', 1));
    expect(bb.rng('a').random()).toBe(bb.rng('a').random());
    expect(bb.rng('a').random()).not.toBe(bb.rng('b').random());
    expect(bb.rng(['tile', 3, 4]).random()).toBe(bb.rng(['tile', 3, 4]).random());
  });
});

describe('defineMove and MoveResult', () => {
  test('declarative move with negation runs to a fixpoint', () => {
    const gen = new EcologicalGenerator();
    gen.addInitialFacts([f('planet', 'a'), f('planet', 'b'), f('planet', 'c')]);
    gen.addDesignMove(defineMove({
      name: 'size',
      query: [['planet', '?p']],
      not: [['size', '?p', '?_']],
      execute: ({ p }, bb) => [f('size', p, bb.rng(['size', p]).choice(['s', 'm', 'l']))],
    }));
    gen.generate(100);
    expect(gen.getFacts('size')).toHaveLength(3);
    expect(gen.getExecutionStats()).toEqual({ size: 3 });
  });

  test('moves can remove facts, and removals are logged', () => {
    const gen = new EcologicalGenerator();
    gen.addInitialFacts([f('alive', 'wolf'), f('alive', 'crow')]);
    gen.addDesignMove(defineMove({
      name: 'fall',
      query: [['alive', '?who']],
      execute: ({ who }) => ({ remove: [f('alive', who)], add: [f('shadow', who)] }),
    }));
    gen.generate(10);
    expect(gen.getFacts('alive')).toHaveLength(0);
    expect(gen.getFacts('shadow')).toHaveLength(2);
    const log = gen.orchestrator!.executionLog;
    expect(log.every(e => e.removedFacts.length === 1)).toBe(true);
    expect(gen.getExecutionSummary()).toContain('1 removed');
  });

  test('custom sensory function is supported', () => {
    const move = defineMove({
      name: 'custom',
      query: function* (): Iterable<Bindings> { yield { n: 1 }; },
      execute: ({ n }) => [f('n', n)],
    });
    expect(move.getAllBindings(new Blackboard())).toEqual([{ n: 1 }]);
  });
});

describe('Deterministic generation', () => {
  const makeGenerator = (seed: number, priority = false) => {
    const gen = new EcologicalGenerator(
      priority ? new DeterministicPrioritySelectionStrategy(seed) : new DeterministicSelectionStrategy(seed)
    );
    gen.addDesignMove(defineMove({
      name: 'tile',
      query: [],
      where: (_b, bb) => bb.count('tile') < 20,
      execute: (_b, bb) => [f('tile', bb.count('tile'))],
    }));
    gen.addDesignMove(defineMove({
      name: 'biome',
      priority: 2,
      query: [['tile', '?t']],
      not: [['biome', '?t', '?_']],
      execute: ({ t }, bb) => [f('biome', t, bb.rng(['biome', t]).choice(['blaze', 'verge', 'hush']))],
    }));
    return gen;
  };

  test('never crashes, for many seeds (previously negative seeds broke selection)', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(() => makeGenerator(seed * 0x9e3779b1).generate(100)).not.toThrow();
      expect(() => makeGenerator(-seed, true).generate(100)).not.toThrow();
    }
  });

  test('same seed gives identical facts in identical order', () => {
    const a = makeGenerator(42).generate(100);
    const b = makeGenerator(42).generate(100);
    expect(a.facts.map(x => x.key)).toEqual(b.facts.map(x => x.key));
    expect(a.getFacts('biome')).toHaveLength(20);
  });
});

describe('Browser compatibility', () => {
  test('core sources import no Node built-ins', () => {
    const dir = path.join(__dirname, '../src/core');
    const nodeBuiltins = /from\s+['"](node:|crypto|fs|path|os|util|buffer|stream|events)['"/]/;
    for (const file of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect({ file, nodeImport: nodeBuiltins.test(source) }).toEqual({ file, nodeImport: false });
    }
  });
});

const GOLDEN_STATE_HASH = '194d095e6b4e4c57';
