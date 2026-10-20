import { NavigationEnd, NavigationError, NavigationStart } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTRO_MINIMO_MS, INTRO_TETTO_MS, INTRO_USCITA_MS, chiudiIntroAllaPrimaPagina } from './intro';

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

  it('l\'icona e\' quella dell\'app: stessi dischi, stesse lettere', () => {
    const icona = fs.readFileSync('public/icons/icon.svg', 'utf8');
    const pezzi = (s: string) => s.match(/x="\d+" y="\d+" width="\d+" height="\d+" rx="\d+"|points="[^"]+"/g) ?? [];
    const intro = index.match(/<div id="intro"[\s\S]*?<\/div>/)![0];
    expect(pezzi(intro)).toEqual(pezzi(icona));
    // I dischi che fanno l'onda sono tutti e sei, a tre a tre per lato.
    expect(intro.match(/class="intro-disco d[123]"/g)!.length).toBe(6);
  });

  it('la dissolvenza dura quanto aspetta il codice prima di toglierla; senza movimento, niente onda', () => {
    expect(stile()).toContain(`transition:opacity ${String(INTRO_USCITA_MS / 1000).replace(/^0/, '')}s`);
    expect(stile()).toMatch(/@media \(prefers-reduced-motion:reduce\)\{#intro \.intro-disco\{animation:none;\}/);
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
});
