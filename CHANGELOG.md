# Changelog

## 2.0.1

### Performance
- `Query.matches` now rejects non-matching facts before allocating anything: literals and already-bound variables are checked first, and variable names are precomputed per query. Patterns with literals, such as `['land', '?s', 'verge', ...]`, get much cheaper. In The Held Hour's chunk generator this cut time per chunk by about a third.

### Fixed
- `bench/bench.js` resolved its dist path relative to its own folder, so the documented command failed. It now resolves relative to the working directory.

## 2.0.0

### Fixed
- **Deterministic selection crashed.** `baseSeed ^ stateSeed` could be negative, the old LCG then produced negative numbers, and `choice()` returned `undefined`. Seeds are now normalised to unsigned 32-bit and the PRNG is mulberry32.
- **State hash depended on the machine's locale** (`localeCompare` in sorting). Hashing and move ordering now use plain code-unit comparison.
- **`facts` exposed the internal array**, so callers could mutate the blackboard behind its back. It now returns a frozen snapshot.
- `new Fact(p, {…})` silently dropped a non-array object argument; it is now wrapped as a single argument.
- The example moves (and the README) kept id counters on the move object, which broke determinism and `reset()`. Ids now come from the blackboard.

### Added
- Runs in browsers: no Node `crypto` (pure-JS hashing) and no runtime dependencies. Ships CommonJS and ES module builds.
- Predicate index and O(1) exact lookups; incremental, order-independent state hash (O(1) per step instead of hashing and sorting every fact). About 27× faster on a 1,000-tile benchmark (`bench/bench.js`).
- `Blackboard.match` (multi-pattern joins with `not` and `where`), `exists`, `count`, `retract`, `removeFact(s)`, `rng(salt)`, `size`, `version`.
- Anonymous wildcards `?_` / `?_name` in patterns; queries accept plain arrays and strings as well as `Query` objects.
- Design moves may return `{ add, remove }`; removals are logged in `ExecutionLogEntry.removedFacts`.
- `defineMove({...})` for declaring moves without a subclass.
- `hashString` / `hash32` helpers.

### Breaking
- For the same seed, generated output differs from 1.x, because both the state hash and the PRNG changed. `getStateHash()` now returns 16 hex digits instead of an MD5 digest.
- `Fact.equals` / `hasFact` compare arguments structurally (by JSON serialisation) rather than by reference.
- `DesignMove.execute` returns `MoveOutput` (`Fact[] | { add, remove }`); code that calls `execute` directly and expects an array should use `normalizeMoveOutput`.
