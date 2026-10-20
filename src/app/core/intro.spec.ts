import { NavigationEnd, NavigationError, NavigationStart } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTRO_MINIMO_MS, INTRO_MINIMO_RIDOTTO_MS, INTRO_TETTO_MS, INTRO_USCITA_MS, chiudiIntroAllaPrimaPagina } from './intro';

/**
 * L'intro dell'avvio se ne va quando la prima pagina e' arrivata, non prima
 * del minimo, e comunque entro il tetto: dietro deve sempre vedersi l'app.
 */
describe('l\'intro dell\'avvio se ne va alla prima pagina', () => {
  let eventi: Subject<unknown>;
  let doc: Document;
  let adesso: number;
  const intro = () => doc.getElementById('intro');

  beforeEach(() => {
    vi.useFakeTimers();
    // Due fotogrammi = due giri di 16 ms: i timer finti li scandiscono.
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16));
    eventi = new Subject();
    doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<div id="intro" aria-busy="true"></div><app-root></app-root>';
    adesso = 100;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const avvia = () => chiudiIntroAllaPrimaPagina({ events: eventi } as any, doc, () => adesso);
  const fine = () => new NavigationEnd(1, '/scheda', '/scheda');

  it('resta finche\' la prima pagina non arriva', () => {
    avvia();
    eventi.next(new NavigationStart(1, '/scheda'));
    vi.advanceTimersByTime(5000);
    expect(intro()?.classList.contains('intro-via')).toBe(false);
  });

  it('arrivata presto, aspetta il minimo; poi si dissolve e se ne va', () => {
    avvia();
    eventi.next(fine());
    vi.advanceTimersByTime(INTRO_MINIMO_MS - adesso - 1);
    expect(intro()!.classList.contains('intro-via')).toBe(false);
    vi.advanceTimersByTime(1 + 32);
    expect(intro()!.classList.contains('intro-via')).toBe(true);
    expect(intro()!.getAttribute('aria-busy')).toBe('false');
    vi.advanceTimersByTime(INTRO_USCITA_MS + 80);
    expect(intro()).toBeNull();
  });

  it('arrivata tardi, se ne va subito', () => {
    adesso = 2500;
    avvia();
    eventi.next(fine());
    vi.advanceTimersByTime(32);
    expect(intro()!.classList.contains('intro-via')).toBe(true);
  });

  it('anche se la navigazione finisce male: dietro deve vedersi l\'errore', () => {
    adesso = 2500;
    avvia();
    eventi.next(new NavigationError(1, '/scheda', new Error('x')));
    vi.advanceTimersByTime(32);
    expect(intro()!.classList.contains('intro-via')).toBe(true);
  });

  it('se la prima pagina non arriva mai, se ne va comunque al tetto', () => {
    avvia();
    vi.advanceTimersByTime(INTRO_TETTO_MS - 1);
    expect(intro()!.classList.contains('intro-via')).toBe(false);
    vi.advanceTimersByTime(1 + 32);
    expect(intro()!.classList.contains('intro-via')).toBe(true);
  });

  it('conta solo la prima navigazione, e il tetto non la rifa\'', () => {
    adesso = 2500;
    avvia();
    eventi.next(fine());
    vi.advanceTimersByTime(32 + INTRO_USCITA_MS + 80);
    expect(intro()).toBeNull();
    // Un'altra pagina e il tetto non trovano piu' niente da togliere, e non si rompe niente.
    eventi.next(fine());
    vi.advanceTimersByTime(INTRO_TETTO_MS);
    expect(doc.querySelector('app-root')).not.toBeNull();
  });

  it('con "riduci movimento" il logo non si costruisce: basta il minimo ridotto', () => {
    Object.defineProperty(doc, 'defaultView', { value: { matchMedia: (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }) } });
    avvia();
    eventi.next(fine());
    vi.advanceTimersByTime(INTRO_MINIMO_RIDOTTO_MS - adesso + 32);
    expect(intro()!.classList.contains('intro-via')).toBe(true);
    expect(INTRO_MINIMO_RIDOTTO_MS).toBeLessThan(INTRO_MINIMO_MS);
  });

  it('senza l\'intro nella pagina non fa niente', () => {
    doc.getElementById('intro')!.remove();
    expect(() => { avvia(); eventi.next(fine()); vi.advanceTimersByTime(INTRO_TETTO_MS); }).not.toThrow();
  });
});

/**
 * L'intro sta in index.html, prima di Angular: il suo stile e' in linea, i
 * colori sono quelli del tema, l'icona e' quella dell'app, e le immagini
 * d'avvio di iOS sono il suo primo fotogramma a ogni misura di iPhone.
 */
describe('l\'intro in index.html e le immagini d\'avvio', () => {
  let fs: any;
  let index = '';
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    fs = await import(/* @vite-ignore */ nome);
    index = fs.readFileSync('src/index.html', 'utf8');
    css = fs.readFileSync('src/styles.css', 'utf8');
  });
  const stile = () => index.match(/<style id="intro-stile">([\s\S]*?)<\/style>/)![1];
  const token = (blocco: string, nome: string) => blocco.match(new RegExp(`--${nome}:\\s*([^;]+);`))![1].trim();
  /** Larghezza, altezza e tipo di colore dall'intestazione IHDR di una PNG. */
  const png = (p: string) => {
    const b: Uint8Array = fs.readFileSync(p);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20), colore: b[25] };
  };

  it('l\'intro c\'e\' prima dell\'app, e il suo stile e\' in linea nella testata', () => {
    expect(index.indexOf('<div id="intro"')).toBeGreaterThan(index.indexOf('<body>'));
    expect(index.indexOf('<div id="intro"')).toBeLessThan(index.indexOf('<app-root>'));
    expect(index.indexOf('<style id="intro-stile">')).toBeLessThan(index.indexOf('</head>'));
    expect(stile()).toMatch(/#intro\{position:fixed;inset:0;z-index:100000;/);
  });

  it('il fondo e il nome hanno i colori del tema, scuro e chiaro', () => {
    const scuro = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
    const chiaro = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)![1];
    expect(stile()).toContain(`background:${token(scuro, 'bg')};color:${token(scuro, 'label')};`);
    expect(stile()).toContain(`html[data-theme="light"] #intro{background:${token(chiaro, 'bg')};color:${token(chiaro, 'label')};}`);
  });

  const intro = () => index.match(/<div id="intro"[\s\S]*?<\/div>/)![0];

  it('il logo e\' quello dell\'app: stessa sbarra, stessi dischi, stesse lettere', () => {
    const icona = fs.readFileSync('public/icons/icon.svg', 'utf8');
    const pezzi = (s: string) => s.match(/x="\d+" y="\d+" width="\d+" height="\d+" rx="\d+"|d="M[^"]+"/g) ?? [];
    expect(pezzi(intro())).toEqual(pezzi(icona));
    // I dischi sono sei, tre per lato; la sbarra due estremita'.
    expect(intro().match(/class="intro-disco d[123] (sx|dx)"/g)!.length).toBe(6);
    expect(intro().match(/class="intro-sbarra (sx|dx)"/g)!.length).toBe(2);
  });

  it('senza il riquadro dell\'icona: niente fondo, angoli o ombra intorno al logo', () => {
    expect(intro()).not.toMatch(/<rect width="1024"/);
    expect(intro()).not.toContain('clipPath');
    const logo = stile().match(/#intro \.intro-logo\{[^}]*\}/)![0];
    expect(logo).not.toMatch(/box-shadow|border-radius|background/);
  });

  it('la W e la L entrano di scatto, prima la W', () => {
    const lettera = stile().match(/#intro \.intro-lettera\{[^}]*\}/)![0];
    expect(lettera).toMatch(/animation:intro-scatto \.46s cubic-bezier\([^)]*\) \.5s both/);
    expect(stile()).toContain('#intro .intro-l{animation-delay:.62s;}');
    expect(stile()).toMatch(/@keyframes intro-scatto\{from\{opacity:0;transform:translateX\(-\d+px\) skewX\(-\d+deg\);\}to\{opacity:1;transform:none;\}\}/);
    expect(intro().match(/class="intro-lettera intro-[wl]"/g)!.length).toBe(2);
  });

  it('le lettere e il nome sono in Kanit Bold Italic, in linea: ci sono gia\' al primo fotogramma', () => {
    const faccia = stile().match(/@font-face\{font-family:"Workout Lab Kanit";src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\) format\("woff2"\);font-weight:700;font-style:italic;font-display:block;\}/);
    expect(faccia).toBeTruthy();
    const dati = atob(faccia![1]);
    expect(dati.slice(0, 4)).toBe('wOF2');
    // Solo le lettere di "Workout Lab": pochi KB, non il carattere intero.
    expect(dati.length).toBeLessThan(8000);
    expect(stile()).toContain('The Kanit Project Authors');
    expect(stile()).toContain('SIL Open Font License 1.1');
    expect(stile()).toMatch(/#intro \.intro-nome\{[^}]*font:italic 700 \d+px\/[\d.]+ "Workout Lab Kanit",/);
    expect(css).toMatch(/\.authtitle\{font-family:"Workout Lab Kanit",[^}]*font-style:italic;font-weight:700;/);
  });

  it('l\'intro resta almeno fino alla fine della costruzione del logo', () => {
    // Le animazioni che finiscono (non l'onda, che gira finche' serve): durata + ritardo.
    const base = stile().split('@media')[0].replace(/cubic-bezier\([^)]*\)/g, 'curva');
    const tempi = (s: string) => (s.match(/\d*\.?\d+s/g) ?? []).map(t => parseFloat(t) * 1000);
    const fini = [...base.matchAll(/[;{]animation:([^;]+);/g)]
      .flatMap(m => m[1].split(','))
      .filter(a => !a.includes('infinite'))
      .map(a => { const [durata, ritardo = 0] = tempi(a); return durata + ritardo; });
    // I dischi piu' piccoli entrano piu' tardi: il loro ritardo e' scritto a parte.
    const disco = tempi(base.match(/#intro \.intro-disco\{[^}]*animation:([^,;]+)/)![1])[0];
    for (const m of base.matchAll(/animation-delay:([^,;]+)/g)) fini.push(tempi(m[1])[0] + disco);
    expect(fini.length).toBeGreaterThan(6);
    expect(INTRO_MINIMO_MS).toBeGreaterThanOrEqual(Math.max(...fini));
  });

  it('la dissolvenza dura quanto aspetta il codice prima di toglierla; senza movimento il logo compare e basta', () => {
    expect(stile()).toContain(`transition:opacity ${String(INTRO_USCITA_MS / 1000).replace(/^0/, '')}s`);
    const ridotto = stile().match(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*)\}/)![1];
    for (const parte of ['.intro-sbarra', '.intro-disco', '.intro-lettera', '.intro-nome']) expect(ridotto).toContain(`#intro ${parte}`);
    expect(ridotto).toContain('{animation:intro-appare .3s ease both;}');
  });

  it('per ogni misura di iPhone c\'e\' l\'immagine scura e quella chiara, opache e della misura giusta', () => {
    const link = [...index.matchAll(/<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\) and \(prefers-color-scheme: (dark|light)\)" href="([^"]+)">/g)];
    expect(link.length).toBeGreaterThanOrEqual(20);
    expect(link.length).toBe((index.match(/apple-touch-startup-image" media/g) ?? []).length);
    const misure = new Map<string, Set<string>>();
    for (const [, w, h, dpr, schema, href] of link) {
      const vera = png(`public/${href}`);
      expect([vera.w, vera.h], href).toEqual([+w * +dpr, +h * +dpr]);
      expect(vera.colore, href).toBe(2);
      expect(href).toContain(schema === 'dark' ? '-scuro.png' : '-chiaro.png');
      const k = `${w}x${h}@${dpr}`;
      misure.set(k, (misure.get(k) ?? new Set()).add(schema));
    }
    for (const [k, schemi] of misure) expect([...schemi].sort(), k).toEqual(['dark', 'light']);
  });

  it('le immagini d\'avvio sono il primo fotogramma dell\'intro: il solo fondo del tema', async () => {
    const nome = 'node:zlib';
    const zlib = await import(/* @vite-ignore */ nome);
    const scuro = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
    const chiaro = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)![1];
    const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    /** I pixel di una PNG a 8 bit RGB, senza interlacciamento: i blocchi IDAT, inflate e i filtri di riga. */
    const pixel = (p: string) => {
      const b: Uint8Array = fs.readFileSync(p);
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const w = dv.getUint32(16), h = dv.getUint32(20);
      expect([b[24], b[25], b[28]], p).toEqual([8, 2, 0]);
      const idat: Uint8Array[] = [];
      for (let o = 8; o < b.length;) {
        const n = dv.getUint32(o), tipo = String.fromCharCode(...b.subarray(o + 4, o + 8));
        if (tipo === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + n));
        o += 12 + n;
      }
      const tutto = new Uint8Array(idat.reduce((t, c) => t + c.length, 0));
      idat.reduce((o, c) => { tutto.set(c, o); return o + c.length; }, 0);
      const dati: Uint8Array = zlib.inflateSync(tutto);
      const riga = w * 3, out = new Uint8Array(riga * h);
      for (let y = 0; y < h; y++) {
        const f = dati[y * (riga + 1)];
        for (let x = 0; x < riga; x++) {
          const v = dati[y * (riga + 1) + 1 + x];
          const a = x >= 3 ? out[y * riga + x - 3] : 0, su = y ? out[(y - 1) * riga + x] : 0, c = x >= 3 && y ? out[(y - 1) * riga + x - 3] : 0;
          const pa = Math.abs(su - c), pb = Math.abs(a - c), pc = Math.abs(a + su - 2 * c);
          const pred = [0, a, su, (a + su) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? su : c][f];
          out[y * riga + x] = (v + pred) & 255;
        }
      }
      return out;
    };
    for (const [file, blocco] of [['avvio-750x1334-scuro', scuro], ['avvio-750x1334-chiaro', chiaro], ['avvio-1320x2868-scuro', scuro], ['avvio-1320x2868-chiaro', chiaro]] as const) {
      const fondo = rgb(token(blocco, 'bg'));
      const px = pixel(`public/avvio/${file}.png`);
      let diversi = 0;
      for (let i = 0; i < px.length; i += 3) if (px[i] !== fondo[0] || px[i + 1] !== fondo[1] || px[i + 2] !== fondo[2]) diversi++;
      expect(diversi, file).toBe(0);
    }
  });
});
