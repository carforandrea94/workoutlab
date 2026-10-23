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

  it('in testata un titolo lungo finisce coi puntini prima delle azioni, non ci passa sotto', () => {
    const css = fs.readFileSync('src/styles.css', 'utf8');
    // Un elemento flex non si restringe sotto la larghezza del suo testo: senza
    // min-width:0 "Dorso-Delt.post-Bicipiti" finiva sotto il selettore elenco/slider.
    const titolo = css.match(/ion-toolbar ion-title:not\(\.title-large\)\{[^}]*\}/)![0];
    expect(titolo).toContain('min-width:0;');
    expect(css).toMatch(/\.navtitle\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis;/);
  });

  it('il comando in basso di una pagina interna e\' fatto come la barra delle tab: ogni ion-footer e\' una barra-azione, e il contenuto le passa sotto', () => {
    const conFooter = template().filter(f => f.testo.includes('<ion-footer'));
    expect(conFooter.map(f => f.nome.split('/').pop()).sort()).toEqual([
      'corsa-nuova.component.html', 'dieta-detail.component.html', 'misura-categoria.component.html',
      'protocollo-import.component.html', 'scheda-detail.component.html'
    ]);
    for (const f of conFooter) {
      for (const t of f.testo.match(/<ion-footer[^>]*>/g)!) {
        expect(t, f.nome).toMatch(/class="[^"]*\bbarra-azione\b/);
        expect(t, f.nome).toContain('[class.ridotta]=');
      }
      expect(f.testo, f.nome).toMatch(/<ion-content[^>]*con-barra/);
    }
    // I tasti principali non stanno piu' in fondo al contenuto.
    expect(template().filter(f => /class="savebar|class="runsave/.test(f.testo)).map(f => f.nome)).toEqual([]);
  });

  it('fascia del recupero, pillola della sessione e barre che spariscono dentro la pagina se ne vanno con un\'animazione, non di colpo', () => {
    // animate.leave: Angular mette la classe e toglie l'elemento a animazione finita (vedi styles.css).
    const tabs = file.find(f => f.nome.endsWith('tabs.page.ts'))!.testo;
    expect(tabs).toContain('<app-rest-bar animate.leave="fascia-via"></app-rest-bar>');
    expect(tabs).toContain('class="sessionpill" animate.leave="pillola-via"');
    for (const nome of ['scheda-detail.component.html', 'dieta-detail.component.html']) {
      const t = template().find(f => f.nome.endsWith(nome))!.testo;
      expect(t, nome).toMatch(/<ion-footer[^>]*barra-azione[^>]*animate\.leave="barra-via"/);
    }
    // "Recupero finito" se ne va dissolvendosi segnando la serie.
    expect(template().find(f => f.nome.endsWith('scheda-detail.component.html'))!.testo)
      .toContain('<p class="fine-recupero" *ngIf="recuperoFinito" animate.leave="svanisce">');
    // Nell'allenamento "Inizia" e il tasto della serie sono una barra sola: toccando
    // "Inizia" non esce e rientra. L'altra e' quella del resoconto.
    const scheda = template().find(f => f.nome.endsWith('scheda-detail.component.html'))!.testo;
    expect(scheda.match(/<ion-footer/g)!.length).toBe(2);
  });

  it('sopra il contenuto che passa sotto la barra i tasti sono pieni: spento non va a meta\', "fatto" e\' il vetro della barra delle tab', () => {
    const css = fs.readFileSync('src/styles.css', 'utf8');
    const spento = css.match(/ion-footer\.barra-azione ion-button\.setdone\.button-disabled\{[^}]*\}/)![0];
    expect(spento).toContain('opacity:1;');
    expect(spento).toContain('--background:color-mix(in srgb,var(--accent) 50%,var(--bg))');
    const fatto = css.match(/ion-footer\.barra-azione ion-button\.setdone\.salva-btn\.fatto\{[^}]*\}/)![0];
    expect(fatto).toContain('--background:var(--glass-bg);');
    expect(fatto).toContain('backdrop-filter:var(--glass-filter);');
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

  it('ogni riga che si elimina scorrendo mostra lo stesso "Elimina" rosso (ion-item-option.elimina)', () => {
    const senza = template().flatMap(f => (f.testo.match(/<ion-item-option(?=[\s>])(?![^>]*class="elimina")[^>]*>/g) ?? []).map(t => `${f.nome}: ${t}`));
    expect(senza).toEqual([]);
    expect(template().some(f => /<ion-item-option class="elimina"/.test(f.testo))).toBe(true);
  });

  it('eliminare e rimuovere sono righe rosse, non tasti pieni: il rosso pieno resta solo per confermare nel foglio', () => {
    expect(template().filter(f => /delete-session-btn|runremove/.test(f.testo)).map(f => f.nome)).toEqual([]);
    const dangerbtn = template().filter(f => /class="dangerbtn"/.test(f.testo)).map(f => f.nome);
    // L'unico rimasto e' "Elimina" dentro il foglio che chiede la password per chiudere l'account.
    expect(dangerbtn).toEqual(['src/app/pages/impostazioni/impostazioni.component.html']);
    expect(file.find(f => f.nome.endsWith('impostazioni.component.html'))!.testo.match(/class="dangerbtn"/g)!.length).toBe(1);
  });

  it('"Elimina questa seduta", "...misurazione" e "...uscita" sono righe rosse in una lista', () => {
    for (const [nome, etichetta] of [
      ['scheda-detail.component.html', 'Elimina questa seduta'],
      ['misure-storico-detail.component.html', 'Elimina questa misurazione'],
      ['corsa-nuova.component.html', 'Elimina questa uscita']
    ]) {
      const t = file.find(f => f.nome.endsWith(nome))!.testo;
      expect(t, nome).toMatch(new RegExp(`<ion-item class="riga-distruttiva"[^>]*>\\s*<ion-label>${etichetta}</ion-label>`));
    }
  });

  it('nelle righe dei protocolli e dei piani non c\'e\' il cestino: si elimina scorrendo, o da dentro', () => {
    const protocolli = file.find(f => f.nome.endsWith('protocolli.component.html'))!.testo;
    expect(protocolli).not.toContain('delete-btn');
    expect(protocolli).toContain('class="elimina"');
    const builder = file.find(f => f.nome.endsWith('protocollo-builder.component.html'))!.testo;
    expect(builder).toContain('Elimina protocollo');
    expect(builder).toContain('Rimuovi piano');
    expect(builder).not.toMatch(/removePlan\(plan, \$event\)" title="Elimina"/);
  });

  it('nessun campo file del browser in vista ("Choose File"): i PDF si scelgono da una riga', () => {
    const visibili = template().flatMap(f => (f.testo.match(/<input[^>]*type="file"[^>]*>/g) ?? []).filter(t => !/\bhidden\b/.test(t)).map(t => `${f.nome}: ${t}`));
    expect(visibili).toEqual([]);
  });

  it('i campi dei moduli hanno l\'etichetta nella riga: in Nuova uscita, nelle misure e in Importa non ci sono piu\' le scatole con l\'etichetta sopra', () => {
    for (const nome of ['corsa-nuova.component.html', 'misura-categoria.component.html', 'protocollo-import.component.html']) {
      const t = file.find(f => f.nome.endsWith(nome))!.testo;
      expect(t, nome).not.toMatch(/class="authfield|class="measure-field|class="measure-grid/);
    }
    // Nel builder restano solo i due campi dentro il riquadro del cluster (Pausa minima, Fine della serie).
    const builder = file.find(f => f.nome.endsWith('protocollo-builder.component.html'))!.testo;
    expect((builder.match(/class="authfield/g) ?? []).length).toBe(2);
    for (const vecchia of ['Nome protocollo', 'Data inizio programma', 'Nome giorno', 'Nome esercizio', 'Minuti a settimana', 'Nota (opzionale)'])
      expect(builder, vecchia).not.toContain(`<label>${vecchia}</label>`);
  });
});
