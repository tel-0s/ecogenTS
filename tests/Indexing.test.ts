import { Blackboard, Fact, Orchestrator, DeterministicPrioritySelectionStrategy, defineMove, SimpleRandomGenerator } from '../src/index';

const f = (predicate: string, ...args: any[]) => new Fact(predicate, args);

/** What a query must return: a plain scan of the facts, in insertion order. */
function scan(bb: Blackboard, pattern: [string, ...any[]]): unknown[] {
  const out: unknown[] = [];
  const q = new (require('../src/index').Query)(pattern);
  for (const fact of bb.facts) {
    const b = q.matches(fact);
    if (b) out.push(b);
  }
  return out;
}

describe('field indexes', () => {
  test('indexed queries give the same results, in the same order, as a scan', () => {
    const rng = new SimpleRandomGenerator(42);
    const bb = new Blackboard();
    const live: Fact[] = [];
    const patterns: [string, ...any[]][] = [
      ['edge', '?a', 'b'],
      ['edge', 'a', '?b'],
      ['edge', '?a', '?a'],
      ['edge', 'c', 'd'],
      ['node', '?n', 3],
      ['node', 'x', '?_'],
      ['edge', '?_', '?_'],
    ];
    const letters = ['a', 'b', 'c', 'd', 'x'];
    for (let i = 0; i < 2000; i++) {
      const roll = rng.random();
      if (roll < 0.55 || live.length === 0) {
        const fact = rng.random() < 0.6
          ? f('edge', rng.choice(letters), rng.choice(letters))
          : f('node', rng.choice(letters), rng.randomInt(0, 5));
        bb.addFact(fact);
        live.push(fact);
      } else {
        const victim = live.splice(rng.randomInt(0, live.length), 1)[0];
        // Remove by a structurally equal fact, not the stored instance.
        expect(bb.removeFact(new Fact(victim.predicate, [...victim.args]))).toBe(true);
      }
      if (i % 50 === 0) {
        for (const p of patterns) expect([...bb.query(p)]).toEqual(scan(bb, p));
      }
    }
    for (const p of patterns) expect([...bb.query(p)]).toEqual(scan(bb, p));
  });

  test('joins use bound variables from earlier patterns', () => {
    const bb = new Blackboard();
    for (let i = 0; i < 100; i++) bb.addFact(f('server', `s${i}`, i % 3 === 0 ? 'bank' : 'relay'));
    for (let i = 0; i < 100; i++) bb.addFact(f('account', `a${i}`, `s${i}`));
    const banks = [...bb.match([['server', '?s', 'bank'], ['account', '?a', '?s']])];
    expect(banks).toHaveLength(34);
    expect(banks[0]).toEqual({ s: 's0', a: 'a0' });
    const bare = [...bb.match([['server', '?s', 'relay']], { not: [['account', '?_', '?s']] })];
    expect(bare).toHaveLength(0);
  });

  test('a multiset keeps every copy, and removal takes the oldest', () => {
    const bb = new Blackboard();
    const a = f('p', 1);
    bb.addFact(a);
    bb.addFact(a); // the same instance twice
    bb.addFact(f('p', 2));
    bb.addFact(f('p', 1));
    expect(bb.count(['p', 1])).toBe(3);
    expect(bb.facts).toHaveLength(4);
    expect(bb.facts[0]).toBe(a);
    expect(bb.removeFact(f('p', 1))).toBe(true);
    expect(bb.facts.map(x => x.args[0])).toEqual([1, 2, 1]);
    expect(bb.facts[0]).not.toBe(a);
    expect(bb.retract(['p', 1])).toHaveLength(2);
    expect(bb.facts.map(x => x.args[0])).toEqual([2]);
    expect(bb.removeFact(f('p', 1))).toBe(false);
  });

  test('a cloned board has its own indexes', () => {
    const bb = new Blackboard();
    bb.addFact(f('p', 1));
    expect(bb.count(['p', 1])).toBe(1);
    const copy = bb.clone();
    copy.addFact(f('p', 1));
    copy.removeFact(f('p', 1));
    expect(bb.count(['p', '?x'])).toBe(1);
    expect(copy.count(['p', 1])).toBe(1);
    expect(copy.getStateHash()).toBe(bb.getStateHash());
  });
});

describe('read tracking', () => {
  test('versions count changes per predicate', () => {
    const bb = new Blackboard();
    expect(bb.versionOf('p')).toBe(0);
    bb.addFact(f('p', 1));
    bb.addFact(f('q', 1));
    bb.removeFact(f('p', 1));
    expect(bb.versionOf('p')).toBe(2);
    expect(bb.versionOf('q')).toBe(1);
    bb.clear();
    expect(bb.versionOf('q')).toBe(2);
  });

  test('track records what was read, and stays fresh until it changes', () => {
    const bb = new Blackboard();
    bb.addFact(f('p', 1));
    const { value, reads } = bb.track(() => bb.count(['p', '?x']) + (bb.exists(['q', '?_']) ? 10 : 0));
    expect(value).toBe(1);
    expect([...reads.predicates.keys()].sort()).toEqual(['p', 'q']);
    bb.addFact(f('r', 1));
    expect(reads.fresh(bb)).toBe(true);
    bb.addFact(f('q', 1));
    expect(reads.fresh(bb)).toBe(false);
  });

  test('reading the whole board makes any change stale', () => {
    const bb = new Blackboard();
    const { reads } = bb.track(() => bb.getStateSeed());
    expect(reads.has('anything')).toBe(true);
    bb.addFact(f('z', 1));
    expect(reads.fresh(bb)).toBe(false);
  });

  test('tracking nests', () => {
    const bb = new Blackboard();
    const outer = bb.track(() => {
      bb.exists(['a']);
      return bb.track(() => bb.exists(['b'])).reads;
    });
    expect([...outer.reads.predicates.keys()]).toEqual(['a', 'b']);
    expect([...outer.value.predicates.keys()]).toEqual(['b']);
  });
});

describe('memoized moves', () => {
  function world(memoize: boolean) {
    let queries = 0; // queries of 'idle', whose predicate never changes
    const bb = new Blackboard();
    for (let i = 0; i < 20; i++) bb.addFact(f('seed', i));
    const grow = defineMove({
      name: 'grow',
      memoize,
      query: [['seed', '?n']],
      not: [['plant', '?n']],
      execute: ({ n }) => [f('plant', n)],
    });
    const count = defineMove({
      name: 'count',
      memoize,
      priority: 0.5,
      query: b => {
        return b.count('plant') === 20 && !b.exists(['done']) ? [{}] : [];
      },
      execute: () => [f('done')],
    });
    const idle = defineMove({
      name: 'idle',
      memoize,
      query: b => {
        queries++;
        return b.exists(['never']) ? [{}] : [];
      },
      execute: () => [],
    });
    const orch = new Orchestrator(bb, [grow, count, idle], new DeterministicPrioritySelectionStrategy(3));
    orch.run(100);
    return { bb, queries, log: orch.executionLog.map(e => [e.moveName, e.bindings]) };
  }

  test('give the same run as moves without the cache, with fewer queries', () => {
    const plain = world(false);
    const cached = world(true);
    expect(cached.log).toEqual(plain.log);
    expect(cached.bb.getStateHash()).toBe(plain.bb.getStateHash());
    expect(plain.queries).toBe(plain.log.length + 1);
    expect(cached.queries).toBe(1);
  });
});

describe('deterministic selection', () => {
  test('picks the same move as sorting every key would', () => {
    const { DeterministicSelectionStrategy, ExecutableMove } = require('../src/index');
    const rng = new SimpleRandomGenerator(9);
    const moves = ['a', 'b', 'ab', 'b2'].map(name => defineMove({ name, query: [], execute: () => [] }));
    for (let trial = 0; trial < 300; trial++) {
      const bb = new Blackboard();
      bb.addFact(f('trial', trial));
      const n = rng.randomInt(1, 40);
      const list = Array.from({ length: n }, () => new ExecutableMove(rng.choice(moves), { x: rng.randomInt(0, 12), y: rng.choice(['p', 'q']) }));
      const picked = new DeterministicSelectionStrategy(5).select(list, bb);
      // The reference: sort every key, then choose with the same seed.
      const seeded = new SimpleRandomGenerator((5 ^ bb.getStateSeed()) >>> 0);
      const keys = list.map((m: any) => `${m.move.name}:${JSON.stringify(m.bindings, Object.keys(m.bindings).sort())}`).sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
      const expected = keys[seeded.randomInt(0, keys.length)];
      expect(`${picked.move.name}:${JSON.stringify(picked.bindings, Object.keys(picked.bindings).sort())}`).toBe(expected);
    }
  });
});
