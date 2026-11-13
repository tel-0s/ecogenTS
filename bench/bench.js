// Usage (from the repo root): node bench/bench.js [path-to-dist] <n> [det]
// Two moves over a growing world: make tiles, then give each tile a biome.
const E = require(require('path').resolve(process.argv[2] ?? 'dist'));
const n = +process.argv[3];
const det = process.argv[4] === 'det';
class Make extends E.DesignMove {
  constructor(n) { super('make', 1); this.n = n; }
  *sensoryQuery(bb) { const c = bb.getFacts('tile').length; if (c < this.n) yield { i: c }; }
  execute(b) { return [new E.Fact('tile', [b.i])]; }
}
class Biome extends E.DesignMove {
  constructor() { super('biome', 1); }
  *sensoryQuery(bb) {
    for (const b of bb.query(new E.Query(['tile', '?t']))) if (!bb.hasFact('biomed', b.t)) yield b;
  }
  execute(b) { return [new E.Fact('biomed', [b.t]), new E.Fact('biome', [b.t, b.t % 3])]; }
}
const g = new E.EcologicalGenerator(det ? new E.DeterministicSelectionStrategy(7) : new E.RandomSelectionStrategy(7));
g.addDesignMove(new Make(n)); g.addDesignMove(new Biome());
const t = performance.now();
g.generate(10 * n);
const ms = performance.now() - t;
console.log(JSON.stringify({ n, det, facts: g.blackboard.facts.length, ms: Math.round(ms) }));
