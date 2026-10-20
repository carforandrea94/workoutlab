import { beforeAll, describe, expect, it } from 'vitest';

/**
 * L'icona dell'app (WL nella presa) e i file che la portano in giro: le PNG
 * devono avere le misure che dicono di avere, la 180 di iOS dev'essere opaca,
 * il disegno deve stare nella zona sicura di Android e il marchio del login
 * deve essere lo stesso segno, con i colori del tema.
 */
describe('l\'icona dell\'app', () => {
  let fs: any;
  beforeAll(async () => {
    const nome = 'node:fs';
    fs = await import(/* @vite-ignore */ nome);
  });
  const testo = (p: string) => fs.readFileSync(p, 'utf8') as string;
  /** Larghezza, altezza e tipo di colore dall'intestazione IHDR di una PNG. */
  const png = (p: string) => {
    const b: Uint8Array = fs.readFileSync(p);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect(Array.from(b.subarray(1, 4)).map(c => String.fromCharCode(c)).join(''), p).toBe('PNG');
    return { w: dv.getUint32(16), h: dv.getUint32(20), colore: b[25] };
  };

  it('le PNG del manifest esistono e misurano quello che dichiarano', () => {
    const manifest = JSON.parse(testo('public/manifest.webmanifest'));
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icona of manifest.icons) {
      const [w, h] = icona.sizes.split('x').map(Number);
      const vera = png(`public/${icona.src}`);
      expect([vera.w, vera.h], icona.src).toEqual([w, h]);
    }
  });

  it('iOS prende la 180 opaca: con la trasparenza riempirebbe di nero', () => {
    const index = testo('src/index.html');
    const link = index.match(/<link rel="apple-touch-icon" sizes="(\d+)x(\d+)" href="([^"]+)">/);
    expect(link).toBeTruthy();
    const [, w, h, href] = link!;
    const vera = png(`public/${href}`);
    expect([vera.w, vera.h]).toEqual([Number(w), Number(h)]);
    expect([vera.w, vera.h]).toEqual([180, 180]);
    // 2 = RGB, senza canale alfa
    expect(vera.colore).toBe(2);
    for (const f of ['icon-192x192.png', 'icon-512x512.png']) expect(png(`public/icons/${f}`).colore, f).toBe(2);
  });

  it('le favicon dell\'index ci sono', () => {
    const index = testo('src/index.html');
    const hrefs = [...index.matchAll(/<link rel="icon"[^>]*href="([^"]+)"/g)].map(m => m[1]);
    expect(hrefs).toContain('icons/icon-compact.svg');
    for (const h of hrefs) expect(fs.existsSync(`public/${h}`), h).toBe(true);
    expect(png('public/icons/icon-32x32.png')).toMatchObject({ w: 32, h: 32 });
  });

  /** I punti di un path con soli comandi assoluti (M L H V Q C Z), come li scrive fontTools. */
  const puntiDelPath = (d: string): [number, number][] => {
    const out: [number, number][] = [];
    let x = 0, y = 0;
    for (const [, cmd, args] of d.matchAll(/([MLHVQCZ])([^MLHVQCZ]*)/g)) {
      const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      if (cmd === 'H') { for (const v of n) { x = v; out.push([x, y]); } continue; }
      if (cmd === 'V') { for (const v of n) { y = v; out.push([x, y]); } continue; }
      for (let i = 0; i + 1 < n.length; i += 2) { x = n[i]; y = n[i + 1]; out.push([x, y]); }
    }
    return out;
  };
  const lettere = (s: string) => [...s.matchAll(/<path (?:class="[^"]*" )?d="(M[^"]+)"/g)].map(m => m[1]);

  it('il fondo copre tutto il quadrato e il disegno sta nel cerchio che Android non ritaglia (raggio 409,6)', () => {
    const svg = testo('public/icons/icon.svg');
    expect(svg).toContain('<rect width="1024" height="1024"');
    const dist = (x: number, y: number) => Math.hypot(x - 512, y - 512);
    let peggio = 0;
    for (const m of svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [x, y, w, h] = m.slice(1).map(Number);
      for (const px of [x, x + w]) for (const py of [y, y + h]) peggio = Math.max(peggio, dist(px, py));
    }
    expect(lettere(svg).length).toBe(2);
    for (const d of lettere(svg)) for (const [x, y] of puntiDelPath(d)) peggio = Math.max(peggio, dist(x, y));
    expect(peggio).toBeGreaterThan(300);
    expect(peggio).toBeLessThanOrEqual(409.6);
  });

  it('la W e la L stanno fra i dischi interni, senza toccarli', () => {
    for (const f of ['public/icons/icon.svg', 'public/icons/logo.svg']) {
      const svg = testo(f);
      const xs = lettere(svg).flatMap(d => puntiDelPath(d).map(p => p[0]));
      const dischi = [...svg.matchAll(/<rect x="([\d.]+)" y="277" width="([\d.]+)"/g)].map(m => [+m[1], +m[1] + +m[2]]);
      expect(dischi.length, f).toBe(2);
      expect(Math.min(...xs), f).toBeGreaterThan(dischi[0][1]);
      expect(Math.max(...xs), f).toBeLessThan(dischi[1][0]);
    }
  });

  it('nel marchio la W e la L sono graffiate; nel favicon, troppo piccolo per i graffi, sono lisce', () => {
    // Una lettera di Kanit e' un contorno solo: i graffi tolti dalla forma la
    // spezzano in piu' pezzi (e ci aprono dei buchi).
    const contorni = (d: string) => (d.match(/M/g) ?? []).length;
    const [w, l] = lettere(testo('public/icons/icon.svg'));
    expect(contorni(w)).toBeGreaterThanOrEqual(5);
    expect(contorni(l)).toBeGreaterThanOrEqual(2);
    const piccole = lettere(testo('public/icons/icon-compact.svg'));
    expect(piccole.map(contorni)).toEqual([1, 1]);
  });

  it('il marchio del login e\' lo stesso segno dell\'icona, con i colori del tema e nessun colore fisso', () => {
    const icona = testo('public/icons/icon.svg');
    const logo = testo('src/app/components/logo/logo.component.html');
    const pezzi = (s: string) => s.match(/x="\d+" y="\d+" width="\d+" height="\d+" rx="\d+"/g) ?? [];
    expect(lettere(logo)).toEqual(lettere(icona));
    expect(pezzi(logo).sort()).toEqual(pezzi(icona).sort());
    expect(logo).toContain('fill="var(--accent)"');
    expect(logo).toContain('<g fill="var(--label)">');
    expect(logo).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
  });
});
