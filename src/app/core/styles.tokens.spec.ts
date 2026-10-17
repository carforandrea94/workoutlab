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

/**
 * Barra, fascia del recupero e pillola sono fisse sopra il contenuto: per il
 * browser quello che sta sotto e' gia' "in vista", e il Tab non lo scorreva mai
 * piu' su (7 tappe su 49 in sessione finivano dietro la fascia). Il margine di
 * scorrimento dice quanto del fondo e' coperto.
 */
describe('styles.css — il Tab porta in vista quello che sta sotto la barra', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });

  it('il contenuto che scorre ha un margine di scorrimento in basso, fatto di quanto e\' coperto', () => {
    const regola = css.match(/ion-content::part\(scroll\)\{[^}]*\}/)?.[0] ?? '';
    expect(regola).toMatch(/scroll-padding-bottom:\s*calc\(var\(--coperto-base\)\s*\+\s*var\(--coperto-pillola\)/);
  });

  it('con la fascia del recupero il coperto e\' la sua altezza', () => {
    expect(css).toMatch(/:root\.con-fascia\{--coperto-base:calc\(var\(--restbar-h\)\s*\+\s*var\(--tabbar-gap\)\)/);
  });

  it('senza barra il coperto e\' solo l\'area sicura, e la pillola ne aggiunge', () => {
    expect(css).toMatch(/:root\.senza-tabbar\{--coperto-base:var\(--safe-b\)/);
    expect(css).toMatch(/:root\.con-pillola\{--coperto-pillola:\s*[0-9]+px/);
  });

  it('il campo "Aggiungi alimento" mostra il focus', () => {
    // Era l'unico campo dell'app senza segno di focus (ion-input non ha outline proprio).
    expect(css).toMatch(/\.shop-addrow ion-input:focus-within\{[^}]*border-color:var\(--accent\)/);
  });
});

/**
 * ion-tab-bar e' content-box: --tabbar-h misura lo spazio dei tasti, e
 * imbottitura e bordo si sommano (60 + 12 + 2 = 74). La pillola della sessione
 * contava 60 e finiva 4 px dentro la barra: tutto cio' che si appoggia sopra la
 * barra, o le lascia posto, deve partire dall'altezza che occupa davvero.
 */
describe('styles.css — la barra in basso si misura per quanto occupa davvero', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const px = (token: string) => parseFloat(css.match(new RegExp(`--${token}:\\s*([0-9.]+)px`))![1]);

  it('l\'altezza vera e\' quella dei tasti piu\' imbottitura e bordo', () => {
    expect(css).toMatch(/--tabbar-outer:\s*calc\(var\(--tabbar-h\)\s*\+\s*var\(--tabbar-pad\)\s*\*\s*2\s*\+\s*2px\)/);
    // Il bordo e' di 1 px per lato: se cambia, il "+ 2px" va con lui.
    expect(css).toMatch(/\.tabbar\{[^}]*border:\s*1px solid/);
  });

  it('la barra e\' davvero content-box, o il token non serve', () => {
    // Se qualcuno le da border-box, --tabbar-outer sovrastima e la pillola si stacca.
    expect(css).not.toMatch(/\.tabbar\{[^}]*box-sizing:\s*border-box/);
  });

  it('la pillola della sessione sta sopra la barra, non dentro', () => {
    expect(css).toMatch(/\.sessionpill\{[^}]*transform:translateY\(calc\(-1 \* \(var\(--tabbar-outer\) \+ 10px\)\)\)/);
  });

  it('nessuno spazio sopra la barra si calcola ancora con la sola altezza dei tasti', () => {
    const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const regole = senzaCommenti.match(/[^{}]*\{[^}]*--tabbar-h[^}]*\}/g) ?? [];
    // L'unico posto dove --tabbar-h puo' restare e' la barra stessa (height) e la sua definizione.
    const intrusi = regole.filter(r => !/^\s*\.tabbar\{/.test(r) && !/--tabbar-outer:|--tabbar-h:\s*60px/.test(r));
    expect(intrusi).toEqual([]);
  });

  it('la fascia del recupero resta la piu\' alta, ma di poco: prende il posto della barra', () => {
    expect(px('restbar-h')).toBeGreaterThanOrEqual(px('tabbar-h') + 2 * px('tabbar-pad') + 2);
  });
});

/**
 * Sopra i tasti in basso ("Inizia allenamento", "Fatta", "Ho mangiato questo")
 * c'era una sfumatura nera che copriva il fondo dell'ultima card: il contenuto
 * finisce netto dove comincia il footer. E nell'allenamento le card sono alte
 * quanto il loro contenuto, come nella Dieta.
 */
describe('styles.css — il fondo della pagina e le card dello slider', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  });

  it('niente sfumatura sopra i tasti in basso', () => {
    expect(css).not.toMatch(/\.(avvio|salva)::before/);
  });

  it('le card dello slider non si allungano tutte sulla piu\' alta', () => {
    expect(css).toMatch(/\.exslider\{[^}]*align-items:flex-start/);
  });
});

/**
 * Il vetro delle barre che galleggiano sopra la pagina (barra delle tab,
 * fascia del recupero, pillola della sessione). Le card restano piene: il
 * vetro dietro un testo fa dipendere il contrasto da cosa ci scorre sotto, ed
 * e' per questo che una volta era stato tolto. Qui si tiene il conto: con
 * l'accento pieno che passa sotto la barra (il caso peggiore realistico), le
 * scritte piccole delle barre restano sopra 4,5:1.
 */
describe('styles.css — il vetro delle barre', () => {
  let css = '';
  let scuro = '';
  let chiaro = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    scuro = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
    chiaro = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)![1];
  });

  type Rgba = [number, number, number, number];
  const colore = (blocco: string, token: string): Rgba => {
    const v = blocco.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1].trim();
    if (!v) throw new Error(`--${token} non trovato`);
    const hex = v.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255).concat(1) as Rgba;
    const rgba = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\s*\)$/);
    if (!rgba) throw new Error(`--${token}: "${v}" non e' un colore pieno o rgba`);
    return [+rgba[1] / 255, +rgba[2] / 255, +rgba[3] / 255, +rgba[4]];
  };
  const sopra = (c: Rgba, fondo: Rgba): Rgba => [0, 1, 2].map(i => c[3] * c[i] + (1 - c[3]) * fondo[i]).concat(1) as Rgba;
  const luce = (c: Rgba) => {
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const rapporto = (a: Rgba, b: Rgba) => {
    const [x, y] = [luce(a), luce(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  for (const [tema, blocco] of [['scuro', () => scuro], ['chiaro', () => chiaro]] as const) {
    it(`tema ${tema}: con l'accento sotto, etichette e accento sul vetro restano sopra 4,5:1`, () => {
      const accento = colore(blocco(), 'brand');
      const vetro = sopra(colore(blocco(), 'glass-bg'), accento);
      expect(colore(blocco(), 'glass-bg')[3]).toBeLessThan(1);   // e' davvero vetro
      expect(rapporto(sopra(colore(blocco(), 'label-3'), vetro), vetro)).toBeGreaterThanOrEqual(4.5);
      expect(rapporto(accento, vetro)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('la sfocatura sta solo sulle barre che galleggiano, non sulle card', () => {
    const regole = css.match(/[^{}]*\{[^{}]*backdrop-filter[^{}]*\}/g) ?? [];
    const selettori = regole.map(r => r.slice(0, r.indexOf('{')).trim());
    expect(selettori.sort()).toEqual(['.restbar', '.sessionpill', '.tabbar']);
  });

  it('senza backdrop-filter, o con "riduci trasparenza" e "aumenta contrasto", le barre tornano piene', () => {
    expect(css).toMatch(/@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)\{\s*:root,:root\[data-theme="light"\]\{--glass-bg:var\(--surface-chrome\)/);
    expect(css).toMatch(/@media \(prefers-reduced-transparency:reduce\),\(prefers-contrast:more\)\{\s*:root,:root\[data-theme="light"\]\{--glass-bg:var\(--surface-chrome\);--glass-edge:var\(--border-line\);--glass-filter:none;\}/);
  });

  it('niente sfumatura sotto la barra: coprirebbe quello che passa dietro il vetro', () => {
    expect(css).not.toMatch(/\.tabfade/);
  });
});
