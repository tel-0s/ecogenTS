import { Blackboard } from '../src/core/Blackboard';
import { Fact } from '../src/core/Fact';
import { Query } from '../src/core/Query';

describe('Blackboard', () => {
  let blackboard: Blackboard;

  beforeEach(() => {
    blackboard = new Blackboard();
  });

  test('should start empty', () => {
    expect(blackboard.facts).toEqual([]);
    expect(blackboard.toString()).toBe('Blackboard(0 facts)');
  });

  test('should add single fact', () => {
    const fact = new Fact('planet', ['Earth']);
    blackboard.addFact(fact);
    
    expect(blackboard.facts).toHaveLength(1);
    expect(blackboard.facts[0]).toBe(fact);
  });

  test('should add multiple facts', () => {
    const facts = [
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars']),
      new Fact('star', ['Sun'])
    ];
    blackboard.addFacts(facts);
    
    expect(blackboard.facts).toHaveLength(3);
  });

  test('should query facts', () => {
    blackboard.addFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars']),
      new Fact('star', ['Sun'])
    ]);

    const query = new Query(['planet', '?name']);
    const bindings = Array.from(blackboard.query(query));
    
    expect(bindings).toHaveLength(2);
    expect(bindings).toContainEqual({ name: 'Earth' });
    expect(bindings).toContainEqual({ name: 'Mars' });
  });

  test('should return first query match with queryOne', () => {
    blackboard.addFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars'])
    ]);

    const query = new Query(['planet', '?name']);
    const binding = blackboard.queryOne(query);
    
    expect(binding).toEqual({ name: 'Earth' });
  });

  test('should return null for no matches with queryOne', () => {
    blackboard.addFact(new Fact('star', ['Sun']));

    const query = new Query(['planet', '?name']);
    const binding = blackboard.queryOne(query);
    
    expect(binding).toBeNull();
  });

  test('should check if fact exists', () => {
    blackboard.addFact(new Fact('planet', ['Earth']));

    expect(blackboard.hasFact('planet', 'Earth')).toBe(true);
    expect(blackboard.hasFact('planet', 'Mars')).toBe(false);
    expect(blackboard.hasFact('star', 'Earth')).toBe(false);
  });

  test('should get facts by predicate', () => {
    blackboard.addFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars']),
      new Fact('star', ['Sun'])
    ]);

    const planets = blackboard.getFacts('planet');
    expect(planets).toHaveLength(2);
    
    const stars = blackboard.getFacts('star');
    expect(stars).toHaveLength(1);
    
    const all = blackboard.getFacts();
    expect(all).toHaveLength(3);
  });

  test('should generate deterministic state hash', () => {
    const bb1 = new Blackboard();
    const bb2 = new Blackboard();

    // Add same facts in same order
    const facts = [
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars'])
    ];
    bb1.addFacts(facts);
    bb2.addFacts(facts);

    expect(bb1.getStateHash()).toBe(bb2.getStateHash());
  });

  test('should generate different hash for different states', () => {
    const bb1 = new Blackboard();
    const bb2 = new Blackboard();

    bb1.addFact(new Fact('planet', ['Earth']));
    bb2.addFact(new Fact('planet', ['Mars']));

    expect(bb1.getStateHash()).not.toBe(bb2.getStateHash());
  });

  test('should generate deterministic state seed', () => {
    blackboard.addFact(new Fact('planet', ['Earth']));
    const seed1 = blackboard.getStateSeed();
    const seed2 = blackboard.getStateSeed();

    expect(seed1).toBe(seed2);
    expect(typeof seed1).toBe('number');
  });

  test('should clear all facts', () => {
    blackboard.addFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars'])
    ]);

    blackboard.clear();
    expect(blackboard.facts).toEqual([]);
  });

  test('should clone blackboard', () => {
    blackboard.addFacts([
      new Fact('planet', ['Earth']),
      new Fact('planet', ['Mars'])
    ]);

    const clone = blackboard.clone();
    
    // Should have same facts
    expect(clone.facts).toHaveLength(2);
    expect(clone.getStateHash()).toBe(blackboard.getStateHash());
    
    // But be independent
    clone.addFact(new Fact('star', ['Sun']));
    expect(clone.facts).toHaveLength(3);
    expect(blackboard.facts).toHaveLength(2);
  });

  test('should provide detailed string representation', () => {
    blackboard.addFacts([
      new Fact('planet', ['Earth']),
      new Fact('star', ['Sun'])
    ]);

    const detailed = blackboard.toDetailedString();
    expect(detailed).toContain('Blackboard:');
    expect(detailed).toContain('(planet Earth)');
    expect(detailed).toContain('(star Sun)');
  });

  test('facts should be immutable through getter', () => {
    blackboard.addFact(new Fact('planet', ['Earth']));
    
    const facts = blackboard.facts;
    expect(() => {
      (facts as any).push(new Fact('star', ['Sun']));
    }).toThrow();
  });
});
