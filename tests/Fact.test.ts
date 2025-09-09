import { Fact } from '../src/core/Fact';

describe('Fact', () => {
  test('should create a fact with predicate and args', () => {
    const fact = new Fact('planet', ['Earth']);
    expect(fact.predicate).toBe('planet');
    expect(fact.args).toEqual(['Earth']);
  });

  test('should handle single non-array argument', () => {
    const fact = new Fact('count', 42);
    expect(fact.args).toEqual([42]);
  });

  test('should handle empty args', () => {
    const fact = new Fact('empty', []);
    expect(fact.args).toEqual([]);
  });

  test('should convert to string correctly', () => {
    const fact1 = new Fact('planet', ['Earth']);
    expect(fact1.toString()).toBe('(planet Earth)');

    const fact2 = new Fact('distance', ['Earth', 'Mars', 50]);
    expect(fact2.toString()).toBe('(distance Earth Mars 50)');

    const fact3 = new Fact('alone', []);
    expect(fact3.toString()).toBe('alone');
  });

  test('should check equality correctly', () => {
    const fact1 = new Fact('planet', ['Earth']);
    const fact2 = new Fact('planet', ['Earth']);
    const fact3 = new Fact('planet', ['Mars']);
    const fact4 = new Fact('star', ['Earth']);

    expect(fact1.equals(fact2)).toBe(true);
    expect(fact1.equals(fact3)).toBe(false);
    expect(fact1.equals(fact4)).toBe(false);
  });

  test('should create JSON representation', () => {
    const fact = new Fact('planet', ['Earth', 'blue']);
    expect(fact.toJSON()).toEqual(['planet', ['Earth', 'blue']]);
  });

  test('should make args immutable', () => {
    const args = ['Earth'];
    const fact = new Fact('planet', args);
    
    // Try to modify the original array
    args.push('Mars');
    expect(fact.args).toEqual(['Earth']); // Should remain unchanged
    
    // Try to modify the fact's args
    expect(() => {
      (fact.args as any).push('Mars');
    }).toThrow();
  });
});
