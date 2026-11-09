import { describe, expect, it } from 'vitest';

/**
 * La freccia di una pagina che non ha una pagina prima (ricarica, segnalibro,
 * app riaperta, o una pagina aperta da un altro punto) va al suo defaultHref.
 * Se quell'indirizzo sta in un'altra tab, la pagina e' una trappola: Misure,
 * passata da Account a Progressi, aveva ancora defaultHref="/account", e chi
 * ci arrivava senza pila tornava in Account, poi la tab Progressi riapriva
 * Misure e da li' di nuovo in Account, senza piu' arrivare alla radice.
 *
 * Qui ogni defaultHref scritto per esteso deve stare nella tab della sua pagina.
 */
describe('la freccia indietro resta nella tab della pagina', () => {
  const nome = 'node:fs';
  let fs: any;
  const leggi = async (p: string) => (fs ??= await import(/* @vite-ignore */ nome)).readFileSync(p, 'utf8') as string;

  /** cartella pagina -> prime parti dei percorsi che la aprono (da app.routes.ts) */
  const tabDelleRotte = async () => {
    const rotte = await leggi('src/app/app.routes.ts');
    const per = new Map<string, Set<string>>();
    for (const m of rotte.matchAll(/path:\s*'([^']+)'(?:(?!path:)[^])*?import\('\.\/pages\/([^/]+)\//g)) {
      (per.get(m[2]) ?? per.set(m[2], new Set()).get(m[2])!).add(m[1].split('/')[0]);
    }
    return per;
  };

  it('il censimento trova le pagine di tutte le tab (se no il test non guarda niente)', async () => {
    const per = await tabDelleRotte();
    expect(per.get('misure')).toEqual(new Set(['progressi']));
    expect(per.get('account')).toEqual(new Set(['account']));
    expect(per.get('dieta-storico')).toEqual(new Set(['dieta']));
    expect(per.size).toBeGreaterThan(25);
  });

  it('nessun defaultHref scritto per esteso porta in un\'altra tab', async () => {
    await leggi('src/app/app.routes.ts');
    const per = await tabDelleRotte();
    const tab = new Set(['scheda', 'dieta', 'corsa', 'progressi', 'account']);
    const sbagliati: string[] = [];
    let controllati = 0;
    for (const [cartella, percorsi] of per) {
      const dir = `src/app/pages/${cartella}`;
      const file = (fs.readdirSync(dir) as string[]).filter(f => f.endsWith('.component.html'));
      for (const f of file) {
        const html = await leggi(`${dir}/${f}`);
        // Solo gli indirizzi per esteso: defaultHref="/x/y". Quelli calcolati ([defaultHref]="...") li decide il codice.
        for (const m of html.matchAll(/(?<!\[)defaultHref="(\/[^"]*)"/g)) {
          controllati++;
          const dove = m[1].split('/')[1];
          if (!tab.has(dove)) continue;
          for (const mia of percorsi) if (tab.has(mia) && mia !== dove) sbagliati.push(`${cartella}: sta in "${mia}" ma la freccia va a ${m[1]}`);
        }
      }
    }
    expect(controllati).toBeGreaterThanOrEqual(15);
    expect(sbagliati).toEqual([]);
  });
});
