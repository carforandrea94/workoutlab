import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Le soglie di leggibilita' stanno nei token: se qualcuno le riabbassa, tutto cio'
 * che li usa (una cinquantina di ruoli: etichette, note, "rip.", tab) torna sotto
 * i 12 px che il rilevatore e la lettura "a un metro" non perdonano.
 */
describe('styles.css — soglie di leggibilita\'', () => {
  let css = '';
  // I test girano in Node ma il progetto non ha i tipi di Node: il modulo si carica per nome.
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const px = (token: string) => {
    const m = css.match(new RegExp(`--${token}:\\s*([0-9.]+)px`));
    if (!m) throw new Error(`token --${token} non trovato`);
    return parseFloat(m[1]);
  };

  it('il testo piu\' piccolo non scende sotto gli 11 px', () => {
    expect(px('text-2xs')).toBeGreaterThanOrEqual(11);
  });

  it('metadati e note non scendono sotto i 12 px', () => {
    expect(px('text-xs')).toBeGreaterThanOrEqual(12);
  });

  it('la scala resta ordinata: ogni gradino e\' piu\' grande del precedente', () => {
    const scala = ['text-2xs', 'text-xs', 'text-sm', 'text-md', 'text-lg'].map(px);
    for (let i = 1; i < scala.length; i++) expect(scala[i]).toBeGreaterThan(scala[i - 1]);
  });

  it('nessun corpo di testo fisso sotto gli 11 px nel foglio di stile', () => {
    const fissi = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => parseFloat(m[1]));
    expect(fissi.filter(n => n < 11)).toEqual([]);
  });

  it('le tacche vicine della ruota non si sbiadiscono sotto la soglia di contrasto', () => {
    // A opacita' .45 il testo vicino al valore scelto aveva 1,8:1 in chiaro e 3:1 in scuro.
    const regola = css.match(/\.wheel-item\{[^}]*\}/)?.[0] ?? '';
    expect(regola).not.toMatch(/opacity\s*:\s*0?\.[0-9]+/);
  });
});
