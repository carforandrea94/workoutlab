import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Le regole che tengono le pagine interne allineate alle tab, controllate su
 * tutti i template: una pagina nuova (o vecchia) che le rompe si vede qui,
 * senza aspettare di aprirla.
 */
describe('coerenza delle pagine', () => {
  let file: { nome: string; testo: string }[] = [];
  let fs: any;
  beforeAll(async () => {
    const nomeFs = 'node:fs';
    const nomePath = 'node:path';
    fs = await import(/* @vite-ignore */ nomeFs);
    const path = await import(/* @vite-ignore */ nomePath);
    const giro = (d: string): string[] => fs.readdirSync(d).flatMap((f: string) => {
      const p = path.join(d, f);
      return fs.statSync(p).isDirectory() ? giro(p) : [p];
    });
    file = giro('src/app').filter((p: string) => /\.(html|ts|css)$/.test(p) && !p.endsWith('.spec.ts'))
      .map((nome: string) => ({ nome, testo: fs.readFileSync(nome, 'utf8') }));
  });
  const template = () => file.filter(f => f.nome.endsWith('.html'));

  it('nessuna emoji al posto di un\'icona: le icone sono quelle di Ionic (app-icona)', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    expect(template().filter(f => emoji.test(f.testo)).map(f => f.nome)).toEqual([]);
  });

  it('un solo carattere, Inter, come nelle tab: niente monospazio, e il font non si scarica piu\'', () => {
    expect(file.filter(f => /Plex Mono|monospace/.test(f.testo)).map(f => f.nome)).toEqual([]);
    expect(fs.readFileSync('src/styles.css', 'utf8')).not.toMatch(/Plex Mono|monospace/);
    expect(fs.readFileSync('src/index.html', 'utf8')).not.toContain('Plex');
  });

  it('nessuna pagina ripete come prima sezione il titolo che ha gia\' in testata', () => {
    const doppi = template().filter(f => {
      const titolo = f.testo.match(/<div class="navtitle">([^<{]+)<\/div>/)?.[1]?.trim();
      const sezione = f.testo.match(/<p class="sectiontitle[^"]*">([^<{]+)<\/p>/)?.[1]?.trim();
      return !!titolo && titolo === sezione;
    });
    expect(doppi.map(f => f.nome)).toEqual([]);
  });

  it('nessun template mostra l\'id interno di un giorno ("d1"): si mostra il suo numero o il suo nome', () => {
    expect(template().filter(f => /\{\{[^}]*dayId[^}]*\}\}/.test(f.testo)).map(f => f.nome)).toEqual([]);
  });

  it('nel dettaglio di una misurazione "Modifica" e\' la riga in fondo al riquadro, non un tasto pieno per riquadro', () => {
    const html = template().find(f => f.nome.endsWith('misure-storico-detail.component.html'))!.testo;
    const modifica = html.match(/<ion-button[^>]*editCategory\([^>]*>/g) ?? [];
    expect(modifica.length).toBe(3);
    for (const t of modifica) expect(t).toContain('class="azione-riquadro"');
  });

  it('i tasti non usano caratteri al posto delle icone: niente ✕ ne\' + scritti, c\'e\' app-icona', () => {
    const carattere = /<ion-button[^>]*>\s*(✕|\+)\s*(<\/ion-button>|[A-Za-zÀ-ú{])/;
    expect(template().filter(f => carattere.test(f.testo)).map(f => f.nome)).toEqual([]);
  });

  it('niente occhielli sopra i titoli: il titolo dice da solo cos\'e\'', () => {
    expect(template().filter(f => /class="[^"]*eyebrow/.test(f.testo)).map(f => f.nome)).toEqual([]);
  });
});
