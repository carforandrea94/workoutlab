import { beforeAll, describe, expect, it } from 'vitest';
import {
  arrowBackSharp, reorderTwoSharp, caretDownSharp, chevronBack, chevronExpand, chevronForward, chevronForwardSharp,
  closeCircle, closeSharp, searchOutline, searchSharp
} from 'ionicons/icons';
import { ICONE, NomeIcona, iconeIonic, stileDelDispositivo, stileIcone, svgIcona } from './icone';

/**
 * Le icone nella variante della piattaforma: iOS su iPhone, iPad e Safari,
 * Android (Material) su Android, Chrome e il resto.
 */
describe('stileIcone', () => {
  const ios: [string, string, number][] = [
    ['Safari su iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 5],
    ['Chrome su iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1', 5],
    ['l\'app nativa su iPhone (WebView senza "Safari")', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 5],
    ['iPad con iPadOS, che si dice Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5],
    ['Chrome su iPad, che si dice Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 5],
    ['Safari sul Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0]
  ];
  const md: [string, string, number][] = [
    ['Chrome su Android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', 5],
    ['Firefox su Android', 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0', 5],
    ['l\'app nativa su Android (WebView, che si dice anche "Version/ Safari/")', 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36', 5],
    ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', 5],
    ['Chrome sul Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 0],
    ['Chrome su Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 0],
    ['Edge su Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0', 0],
    ['Chromium su Linux', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/129.0.0.0 Safari/537.36', 0],
    ['Firefox sul Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0', 0],
    ['il vecchio browser di Android, che si dice Safari senza Chrome', 'Mozilla/5.0 (Linux; U; Android 4.4.2; it-it; GT-I9505 Build/KOT49H) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30', 5],
    ['uno user agent vuoto', '', 0]
  ];

  it.each(ios)('%s: iOS', (_, ua, touch) => expect(stileIcone(ua, touch)).toBe('ios'));
  it.each(md)('%s: Android', (_, ua, touch) => expect(stileIcone(ua, touch)).toBe('md'));

  it('legge il dispositivo da navigator (qui jsdom, che non e\' Safari)', () => {
    expect(stileDelDispositivo()).toBe(stileIcone(navigator.userAgent, navigator.maxTouchPoints));
    expect(stileDelDispositivo()).toBe('md');
  });
});

describe('ICONE', () => {
  const nomi = Object.keys(ICONE) as NomeIcona[];
  const svg = /^data:image\/svg\+xml;utf8,<svg /;

  it.each(nomi)('"%s" ha una variante iOS e una Android, diverse', nome => {
    const v = ICONE[nome] as { ios: string; md: string; piena?: string };
    expect(v.ios).toMatch(svg);
    expect(v.md).toMatch(svg);
    expect(v.md).not.toBe(v.ios);
    if (v.piena) {
      expect(v.piena).toMatch(svg);
      expect(v.piena).not.toBe(v.ios);
    }
  });

  it('su iOS la variante a contorno, su Android quella "sharp"', () => {
    expect(svgIcona('trash', 'ios')).toBe(ICONE.trash.ios);
    expect(svgIcona('trash', 'md')).toBe(ICONE.trash.md);
  });

  it('piena vale solo su iOS e solo dove c\'e\'', () => {
    expect(svgIcona('play', 'ios', true)).toBe(ICONE.play.piena);
    expect(svgIcona('play', 'md', true)).toBe(ICONE.play.md);
    expect(svgIcona('trash', 'ios', true)).toBe(ICONE.trash.ios);
  });

  it('indietro e riordina cambiano forma come nei componenti di Ionic', () => {
    expect(ICONE.indietro.md).toBe(arrowBackSharp);
    expect(ICONE.riordina.md).toBe(reorderTwoSharp);
  });
});

describe('iconeIonic', () => {
  it('su iOS le stesse che Ionic usa in modalita\' iOS', () => {
    expect(iconeIonic('ios')).toEqual({
      indietro: chevronBack, dettaglio: chevronForward, select: chevronExpand, cerca: searchOutline, svuota: closeCircle
    });
  });

  it('su Android quelle che Ionic usa in modalita\' Material', () => {
    expect(iconeIonic('md')).toEqual({
      indietro: arrowBackSharp, dettaglio: chevronForwardSharp, select: caretDownSharp, cerca: searchSharp, svuota: closeSharp
    });
  });
});

/**
 * Le icone stanno nel bundle, due varianti l'una: qui solo quelle che i
 * template usano, e nessun template ne chiede una che non c'e' (quello lo
 * controlla gia' il compilatore, perche' il nome e' tipato).
 */
describe('icone usate davvero', () => {
  let sorgenti = '';
  let appConfig = '';
  let css = '';
  beforeAll(async () => {
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    const file = (fs.readdirSync('src/app', { recursive: true }) as string[])
      .filter(f => /\.(ts|html)$/.test(f) && !f.endsWith('.spec.ts') && !f.endsWith('core/icone.ts'));
    sorgenti = file.map(f => fs.readFileSync('src/app/' + f, 'utf8')).join('\n');
    appConfig = fs.readFileSync('src/app/app.config.ts', 'utf8');
    css = fs.readFileSync('src/styles.css', 'utf8');
  });

  it.each(Object.keys(ICONE))('"%s" e\' usata in un template', nome => {
    const usata = sorgenti.includes(`name="${nome}"`) || sorgenti.includes(`'${nome}'`);
    expect(usata, `"${nome}" e' in ICONE ma nessuno la usa: toglierla dal bundle`).toBe(true);
  });

  it('l\'icona riempie il lato che le da\' il componente, e non porta lo spazio della riga', () => {
    expect(css).toContain('app-icona{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1;}');
    expect(css).toContain('app-icona ion-icon{display:block;font-size:inherit;}');
  });

  it('niente piu\' Lucide, ne\' nei template ne\' negli stili', () => {
    expect(sorgenti).not.toMatch(/lucide/i);
    expect(css).not.toMatch(/lucide-icon/);
  });

  it('la freccia indietro di Ionic segue la piattaforma', () => {
    expect(appConfig).toMatch(/backButtonIcon: iconeIonic\(stileDelDispositivo\(\)\)\.indietro/);
  });
});
