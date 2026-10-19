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
 * imbottitura e bordo si sommano (52 + 12 + 2 = 66). La pillola della sessione
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
    const intrusi = regole.filter(r => !/^\s*\.tabbar\{/.test(r) && !/--tabbar-outer:|--tabbar-h:\s*\d+px/.test(r));
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

/**
 * Scorrere col dito sulla barra delle tab (trascina-tab.ts): la barra deve
 * tenersi il gesto, la pastiglia alzata deve stare dietro al dito, e con
 * "riduci movimento" si sposta senza molla ne' ingrandimento.
 */
describe('styles.css — la barra si scorre col dito', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  // Tutte le regole con esattamente quel selettore, una dopo l'altra.
  const regola = (sel: string) =>
    (css.match(new RegExp('(?:^|[}\\n])' + sel.replace(/[.()]/g, '\\$&') + '\\{[^}]*\\}', 'g')) ?? []).join('');

  it('la barra si tiene il gesto e non apre il menu del link alla pressione lunga', () => {
    const r = regola('ion-tab-bar.tabbar');
    expect(r).toContain('touch-action:none');
    expect(r).toContain('-webkit-touch-callout:none');
  });

  it('alzata, la pastiglia e\' piu\' grande e segue il dito piu\' svelta di quanto torni giu\'', () => {
    const alzata = regola('.tabbar.trascina .pill');
    const posata = regola('.tabbar .pill');
    expect(Number(alzata.match(/scale:([0-9.]+)/)?.[1])).toBeGreaterThan(1);
    const durata = (r: string) => Number(r.match(/transition:transform ([0-9.]+)s/)?.[1]);
    expect(durata(alzata)).toBeLessThan(durata(posata));
    expect(durata(alzata)).toBeLessThanOrEqual(0.15);
  });

  it('durante il gesto il colore sta solo sotto la lente, non anche sulla tab da cui si e\' partiti', () => {
    expect(regola('.tabbar.trascina ion-tab-button.tabbtn.tab-selected:not(.sotto-lente)')).toContain('color:var(--label-3)');
    expect(regola('.tabbar.trascina ion-tab-button.tabbtn.tab-selected:not(.sotto-lente)')).toContain('--color-selected:var(--label-3)');
  });

  it('con "riduci movimento" niente molla e niente lente', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.tabbar \.pill,\.tabbar\.trascina \.pill,\.tabbar \.tabbtn \.ic\{transition:none;\}\.tabbar\.trascina \.pill,\.tabbar \.tabbtn\.sotto-lente \.ic\{scale:none;\}\}/);
  });
});

/**
 * La testata come la barra di navigazione di iOS: freccia e icone sono solo
 * il segno, d'accento, senza riquadro ne' ombra (l'ombra sotto il
 * riempimento semitrasparente, su iPhone, faceva una sfumatura). Dentro una
 * toolbar Ionic le colorerebbe come il titolo: --ion-toolbar-color, messo
 * solo su di loro, le riporta all'accento.
 */
describe('styles.css — la testata come la barra di iOS', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const regola = (sel: string) => css.match(new RegExp('(?:^|\\n)' + sel.replace(/[.()[\]]/g, '\\$&') + '\\{[^}]*\\}'))?.[0] ?? '';

  for (const sel of ['ion-button.navicon', 'ion-back-button']) {
    it(`${sel}: solo il segno, d'accento, 44px da toccare`, () => {
      const r = regola(sel);
      expect(r).toContain('--ion-toolbar-color:var(--accent)');
      expect(r).toContain('--color:var(--accent)');
      expect(r).toContain('--background:transparent');
      expect(r).toMatch(/width:44px;height:44px;/);
      expect(r).not.toMatch(/box-shadow:var|border:1px|--border-width:1px/);
    });
  }

  it('il primo e l\'ultimo segno stanno a filo del contenuto', () => {
    expect(css).toContain('ion-buttons[slot=end] > .navicon:last-child{margin-right:-11px;}');
    expect(css).toContain('ion-buttons[slot=start] > ion-back-button:first-child,ion-buttons[slot=start] > .navicon:first-child{margin-left:-11px;}');
  });
});

/**
 * Le liste iOS delle tab prendono i colori del tema: Ionic, senza la sua
 * palette scura, userebbe grigi pensati per il fondo bianco (sottotitoli,
 * note, intestazioni quasi neri sul tema scuro). E il reset in cima al file
 * toglie ai componenti i loro margini: quelli che servono stanno qui.
 */
describe('styles.css — le liste iOS delle tab', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const regola = (sel: string) => css.match(new RegExp('(?:^|\\n)' + sel.replace(/[.()[\]]/g, '\\$&') + '\\{[^}]*\\}'))?.[0] ?? '';

  it('testi secondari, note e intestazioni coi colori del tema', () => {
    expect(regola('.liste-ios ion-label p')).toContain('color:var(--label-2)');
    expect(regola('.liste-ios ion-note')).toContain('color:var(--label-2)');
    expect(regola('.liste-ios ion-note.valore')).toContain('color:var(--label)');
    expect(regola('.liste-ios ion-list-header.sezione')).toContain('--color:var(--label)');
    expect(regola('.liste-ios ion-item')).toContain('--background:var(--surface-card)');
  });

  it('i badge di stato hanno il loro spazio, che il reset toglierebbe', () => {
    expect(regola('.liste-ios ion-badge.stato')).toContain('padding:4px 8px');
  });

  it('le liste raggruppate stanno nei 16px di .wrap, senza il margine in piu\' di Ionic', () => {
    expect(css).toContain('.liste-ios ion-list.list-inset,.liste-ios ion-accordion-group.accordion-group-expand-inset{margin:0 0 20px;');
  });
});

/**
 * La barra come quella di Instagram: pillola di sole icone, larga quanto le
 * sue icone, che scorrendo in giu' si stringe (riduci-barra.ts). Ridotta resta
 * una barra da toccare: il bersaglio non scende sotto i 44 pt delle HIG.
 */
describe('styles.css — la barra come quella di Instagram', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const num = (token: string) => parseFloat(css.match(new RegExp(`--${token}:\\s*([0-9.]+)`))![1]);

  it('ridotta, ogni tasto resta almeno 44 x 44', () => {
    expect(num('tabbar-ridotta')).toBeLessThan(1);
    expect(num('tabbar-h') * num('tabbar-ridotta')).toBeGreaterThanOrEqual(44);
    expect(num('tabbtn-w') * num('tabbar-ridotta')).toBeGreaterThanOrEqual(44);
  });

  it('si stringe con scale verso il fondo, con una transizione, e col focus da tastiera torna intera', () => {
    expect(css).toContain('.tabbar.ridotta{scale:var(--tabbar-ridotta);}');
    expect(css).toContain('.tabbar.ridotta:has(.ion-focused){scale:1;}');
    expect(css).toMatch(/\.tabbar\{[^}]*transform-origin:50% 100%/);
    expect(css).toMatch(/\n\.tabbar\{transition:[^}]*scale \.38s/);
  });

  it('larga quanto le sue quattro icone, non quanto lo schermo; la pillola della sessione uguale', () => {
    expect(css).toMatch(/--tabbar-w:\s*calc\(4 \* var\(--tabbtn-w\)\)/);
    // La barra e' content-box: il suo max-width conta solo i tasti. La pillola
    // (border-box) e' larga quanto la barra intera, bordo compreso.
    expect(css).toMatch(/\.tabbar\{[^}]*max-width:var\(--tabbar-w\)/);
    expect(css).toMatch(/--tabbar-outer-w:\s*calc\(var\(--tabbar-w\)\s*\+\s*var\(--tabbar-pad\)\s*\*\s*2\s*\+\s*2px\)/);
    expect(css).toMatch(/\.sessionpill\{[^}]*max-width:var\(--tabbar-outer-w\)/);
  });

  it('il nome della tab non si vede ma non e\' tolto allo screen reader', () => {
    const r = css.match(/\.tabbar \.tabbtn \.tablabel\{[^}]*\}/)?.[0] ?? '';
    expect(r).toContain('clip-path:inset(50%)');
    expect(r).not.toContain('display:none');
  });

  it('con la barra ridotta la pillola della sessione scende con lei', () => {
    expect(css).toContain(':root.barra-ridotta .sessionpill:not(.senza-barra){transform:translateY(calc(-1 * (var(--tabbar-outer) * var(--tabbar-ridotta) + 10px)));}');
  });
});

/**
 * Le pagine interne parlano come le tab: le intestazioni di sezione sono
 * titoli (non etichette in maiuscoletto), i gruppi sono liste inset unite, le
 * azioni dentro un gruppo sono righe in accento, non tasti pieni.
 */
describe('styles.css — le pagine interne come le tab', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const regola = (sel: string) => css.match(new RegExp('(?:^|\\n)' + sel.replace(/[.()[\]>+:]/g, '\\$&') + '\\{[^}]*\\}'))?.[0] ?? '';

  it('l\'intestazione di sezione e\' quella delle tab: grande, in grassetto, senza maiuscoletto', () => {
    const r = regola('.sectiontitle');
    expect(r).toContain('font-size:var(--text-2xl)');
    expect(r).toContain('font-weight:700');
    expect(r).toContain('color:var(--label)');
    expect(r).not.toContain('text-transform');
    expect(regola('.shop-group-tit')).toContain('font-size:var(--text-2xl)');
  });

  it('un gruppo e\' un riquadro solo, con le righe separate da una linea, non card staccate', () => {
    const r = regola('.grouplist');
    expect(r).toContain('gap:0');
    expect(r).toContain('border-radius:var(--r-lg)');
    expect(r).toContain('border:1px solid var(--border-line)');
    expect(css).toContain('.grouplist ion-item.cardrow,.grouplist ion-item-sliding.cardrow ion-item{--border-radius:0;--inner-border-width:0 0 1px 0;');
    expect(regola('.shop-list')).toContain('gap:0');
  });

  it('le azioni dentro un gruppo o un riquadro sono righe in accento', () => {
    expect(regola('ion-item.riga-azione')).toContain('--color:var(--accent)');
    const r = regola('ion-button.azione-riquadro');
    expect(r).toContain('--background:transparent');
    expect(r).toContain('--color:var(--accent)');
    expect(regola('ion-button.setadd')).toContain('--color:var(--accent)');
    expect(regola('ion-button.setadd')).not.toContain('dashed');
  });

  it('"Riordina" e "Svuota" sono azioni di testo in accento, come Modifica/Fine su iOS', () => {
    const r = regola('ion-button.shop-clear,ion-button.riordina-btn');
    expect(r).toContain('--background:transparent');
    expect(r).toContain('--color:var(--accent)');
    expect(r).toContain('min-height:44px');
  });

  it('il titolo del riquadro della serie a blocchi e\' un titolo, non un maiuscoletto d\'accento', () => {
    const r = regola('.cluster-cap');
    expect(r).toContain('color:var(--label)');
    expect(r).not.toContain('text-transform');
  });

  it('riquadri e card hanno il raggio e il bordo delle liste, senza ombra', () => {
    for (const sel of ['.infocard', '.history-empty', '.ex', '.meal']) {
      const r = regola(sel);
      expect(r, sel).toContain('border-radius:var(--r-lg)');
      expect(r, sel).not.toContain('box-shadow');
    }
  });
});

/**
 * Il piano e il pasto del builder come moduli di iOS: il meno rosso toglie, la
 * riga distruttiva e' rossa, le righe dentro i contenitori del trascinamento
 * hanno la loro linea (Ionic gliela toglierebbe) e la freccia delle
 * alternative gira quando si aprono.
 */
describe('styles.css — la dieta del builder come moduli di iOS', () => {
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    css = fs.readFileSync('src/styles.css', 'utf8');
  });

  it('togliere e rimuovere sono rossi, come in iOS', () => {
    expect(css).toMatch(/ion-button\.togli\{[^}]*--color:var\(--state-danger-text\)/);
    expect(css).toMatch(/\.liste-ios ion-item\.riga-distruttiva\{[^}]*--color:var\(--state-danger-text\)/);
    expect(css).toMatch(/\.liste-ios ion-item-option\.elimina\{[^}]*--background:var\(--state-danger\)/);
  });

  it('le righe nei contenitori del trascinamento hanno la linea, l\'ultima della lista no', () => {
    expect(css).toContain('.dieta-builder ion-list.list-inset .slotdrop > ion-item,.dieta-builder ion-list.list-inset .draglist > ion-item{--inner-border-width:0 0 .55px 0;}');
    expect(css).toContain('.dieta-builder ion-list.list-inset > .slotdrop:last-child > ion-item,.dieta-builder ion-list.list-inset > .draglist:last-child > ion-item:last-child{--inner-border-width:0;}');
  });

  it('la freccia delle alternative gira quando si aprono', () => {
    expect(css).toContain('.dieta-builder .chevron.aperta{rotate:180deg;}');
  });
});
