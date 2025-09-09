import { Query } from '../src/core/Query';
import { Fact } from '../src/core/Fact';

describe('Query', () => {
  test('should create query from string predicate', () => {
    const query = new Query('planet');
    expect(query.predicate).toBe('planet');
    expect(query.args).toEqual([]);
  });

  test('should create query from array pattern', () => {
    const query = new Query(['planet', '?name']);
    expect(query.predicate).toBe('planet');
    expect(query.args).toEqual(['?name']);
  });

  test('should match facts without variables', () => {
    const query = new Query(['planet', 'Earth']);
    const fact1 = new Fact('planet', ['Earth']);
    const fact2 = new Fact('planet', ['Mars']);

    expect(query.matches(fact1)).toEqual({});
    expect(query.matches(fact2)).toBeNull();
  });

  test('should match facts with variables', () => {
    const query = new Query(['planet', '?name']);
    const fact = new Fact('planet', ['Earth']);

    const bindings = query.matches(fact);
    expect(bindings).toEqual({ name: 'Earth' });
  });

  test('should match multiple variables', () => {
    const query = new Query(['distance', '?from', '?to', '?dist']);
    const fact = new Fact('distance', ['Earth', 'Mars', 50]);

    const bindings = query.matches(fact);
    expect(bindings).toEqual({
      from: 'Earth',
      to: 'Mars',
      dist: 50
    });
  });

  test('should respect existing bindings', () => {
    const query = new Query(['planet', '?name']);
    const fact1 = new Fact('planet', ['Earth']);
    const fact2 = new Fact('planet', ['Mars']);

    const existingBindings = { name: 'Earth' };
    
    expect(query.matches(fact1, existingBindings)).toEqual({ name: 'Earth' });
    expect(query.matches(fact2, existingBindings)).toBeNull(); // Conflict
  });

  test('should handle predicate mismatch', () => {
    const query = new Query(['planet', '?name']);
    const fact = new Fact('star', ['Sun']);

    expect(query.matches(fact)).toBeNull();
  });

  test('should handle argument count mismatch', () => {
    const query = new Query(['planet', '?name', '?size']);
    const fact = new Fact('planet', ['Earth']);

    expect(query.matches(fact)).toBeNull();
  });

  test('should handle mixed literals and variables', () => {
    const query = new Query(['orbit', '?planet', 'Sun', '?distance']);
    const fact1 = new Fact('orbit', ['Earth', 'Sun', 150]);
    const fact2 = new Fact('orbit', ['Earth', 'Mars', 150]);

    expect(query.matches(fact1)).toEqual({ planet: 'Earth', distance: 150 });
    expect(query.matches(fact2)).toBeNull(); // 'Mars' doesn't match literal 'Sun'
  });

  test('should convert to string', () => {
    const query1 = new Query('planet');
    expect(query1.toString()).toBe('Query(planet)');

    const query2 = new Query(['planet', '?name']);
    expect(query2.toString()).toBe('Query([planet, ?name])');
  });
});
