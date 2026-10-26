import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { StoricoDietaService } from '../../services/storico-dieta.service';
import { GiornoDieta, PastoDelGiorno } from '../../core/utils/storico-dieta.util';
import { addDaysISO } from '../../core/utils/week-history.util';
import { DietaStoricoComponent } from './dieta-storico.component';

/**
 * Lo Storico della dieta, disegnato davvero: le settimane come gruppi, i giorni
 * come fisarmonica, dentro i pasti fatti con cosa si e' mangiato.
 * Oggi e' lunedi' 26 ottobre 2026.
 */
describe('DietaStoricoComponent', () => {
  afterEach(() => vi.useRealTimers());

  const pasto = (nome: string, fatto: boolean, extra: Partial<PastoDelGiorno> = {}): PastoDelGiorno =>
    ({ id: nome, nome, fatto, alimenti: [], integratori: [], ...extra });
  const colazione = pasto('Colazione', true, {
    combinazione: 'Dolce',
    alimenti: [{ macro: 'carb', nome: 'Pane', qty: '60 g', alPostoDi: 'Pancake' }, { macro: 'protein', nome: 'Whey', qty: '30 g' }],
    integratori: ['Creatina 5 g', 'Omega 3']
  });
  const giorni: GiornoDieta[] = [
    { date: '2026-10-26', piani: { on: { nome: 'Giorno ON', pasti: [colazione, pasto('Pranzo', false), pasto('Cena', false)] } } },
    { date: '2026-10-24', piani: {
      on: { nome: 'Giorno ON', pasti: [pasto('Colazione', true), pasto('Pranzo', true)] },
      off: { nome: 'Giorno OFF', pasti: [pasto('Cena', true, { alimenti: [{ macro: 'protein', nome: 'Merluzzo', qty: '200 g' }] })] }
    } },
    { date: '2026-10-21', piani: { on: { nome: 'Giorno ON', pasti: [pasto('Pranzo', true), pasto('Cena', false)] } } }
  ];

  async function monta(elenco: () => Promise<GiornoDieta[]> = async () => giorni) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
    const servizio = { elenco: vi.fn(elenco) };
    TestBed.configureTestingModule({
      imports: [DietaStoricoComponent],
      providers: [...providerPagina(), { provide: StoricoDietaService, useValue: servizio }]
    });
    const fixture = TestBed.createComponent(DietaStoricoComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.caricato()).toBe(true));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const pulito = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    // Il testo di un ion-label in jsdom si legge dall'HTML (Stencil ne riscrive gli accessori).
    const etichetta = (el: Element) => el.innerHTML.replace(/<span class="sezione-nota">.*?<\/span>/, '').replace(/<[^>]*>/g, '').trim();
    const sezioni = () => Array.from(root.querySelectorAll('ion-list-header.sezione ion-label')).map(etichetta);
    const gruppi = () => Array.from(root.querySelectorAll<HTMLElement & { value?: unknown }>('ion-accordion-group.giorni-dieta'));
    const giorniDi = (g: Element) => Array.from(g.querySelectorAll('ion-accordion.giorno-dieta')).map(a => ({
      titolo: pulito(a.querySelector('[slot=header] h2')),
      piani: pulito(a.querySelector('[slot=header] p')),
      conto: pulito(a.querySelector('[slot=header] ion-note'))
    }));
    return { fixture, root, pulito, sezioni, gruppi, giorniDi, servizio, c: fixture.componentInstance };
  }

  it('e\' una pagina interna della Dieta: la freccia torna alla Dieta, il titolo e\' Storico', async () => {
    const { root } = await monta();
    expect(root.querySelector('ion-back-button')!.getAttribute('defaultHref')).toBe('/dieta');
    expect(root.querySelector('ion-title .navtitle')!.textContent!.trim()).toBe('Storico');
  });

  it('le settimane dalla piu\' recente; quella in corso si chiama "Questa settimana"', async () => {
    const { sezioni, root } = await monta();
    expect(sezioni()).toEqual(['Questa settimana', '19 – 25 ott']);
    expect(root.querySelector('ion-list-header.sezione .sezione-nota')!.textContent).toBe('26 ott – 1 nov');
  });

  it('un giorno chiuso: quando, con che piano, quanti pasti su quanti', async () => {
    const { gruppi, giorniDi } = await monta();
    expect(giorniDi(gruppi()[0])).toEqual([{ titolo: 'Oggi', piani: 'Giorno ON', conto: '1 di 3' }]);
    expect(giorniDi(gruppi()[1])).toEqual([
      { titolo: 'Sabato 24 ottobre', piani: 'Giorno OFF · Giorno ON', conto: '3 di 3' },
      { titolo: 'Mercoledì 21 ottobre', piani: 'Giorno ON', conto: '1 di 2' }
    ]);
  });

  it('il giorno piu\' recente parte aperto, gli altri chiusi', async () => {
    const { gruppi } = await monta();
    expect(gruppi().map(g => g.value)).toEqual(['2026-10-26', null]);
    expect(gruppi().every(g => (g as any).multiple === true)).toBe(true);
  });

  it('aperto: i soli pasti fatti, la combinazione, un alimento per riga, il cambio e gli integratori', async () => {
    const { gruppi, pulito } = await monta();
    const pasti = Array.from(gruppi()[0].querySelectorAll('ion-item.pasto-mangiato'));
    expect(pasti.length).toBe(1);
    expect(pulito(pasti[0].querySelector('h3'))).toBe('Colazione · Dolce');
    expect(Array.from(pasti[0].querySelectorAll('p.alimento')).map(p => pulito(p))).toEqual(['Pane 60 g, al posto di Pancake', 'Whey 30 g']);
    expect(pulito(pasti[0].querySelector('p.integratori'))).toBe('Integratori: Creatina 5 g · Omega 3');
    // Una sola combinazione o nessun integratore: niente da dire.
    const sabato = gruppi()[1].querySelector('ion-accordion.giorno-dieta')!;
    expect(sabato.querySelector('h3 .combo')).toBeNull();
    expect(sabato.querySelector('p.integratori')).toBeNull();
  });

  it('con due piani nello stesso giorno, il nome del piano sopra i suoi pasti; con uno solo no', async () => {
    const { gruppi, pulito } = await monta();
    const [sabato, mercoledi] = Array.from(gruppi()[1].querySelectorAll('ion-accordion.giorno-dieta'));
    const lista = sabato.querySelector('ion-list.pasti-mangiati')!;
    const voci = Array.from(lista.children).map(el => el.matches('ion-list-header')
      ? 'piano: ' + el.querySelector('ion-label')!.innerHTML.replace(/<[^>]*>/g, '').trim()
      : pulito(el.querySelector('h3')));
    expect(voci).toEqual(['piano: Giorno OFF', 'Cena', 'piano: Giorno ON', 'Colazione', 'Pranzo']);
    expect(mercoledi.querySelector('ion-list-header.piano-giorno')).toBeNull();
  });

  it('oltre dodici settimane, le piu\' vecchie si chiedono', async () => {
    const tante: GiornoDieta[] = Array.from({ length: 15 }, (_, i) => ({
      date: addDaysISO('2026-10-26', -7 * i), piani: { on: { nome: 'Giorno ON', pasti: [pasto('Pranzo', true)] } }
    }));
    const { root, fixture, sezioni } = await monta(async () => tante);
    expect(sezioni().length).toBe(12);
    const altre = root.querySelector<HTMLElement>('ion-button.week-more')!;
    expect(altre.textContent!.trim()).toBe('Mostra le altre 3 settimane');
    altre.click();
    fixture.detectChanges();
    expect(sezioni().length).toBe(15);
    expect(root.querySelector('ion-button.week-more')).toBeNull();
  });

  it('senza giorni lo dice, e dice come si riempie', async () => {
    const { root, pulito } = await monta(async () => []);
    expect(root.querySelector('ion-accordion-group')).toBeNull();
    expect(pulito(root.querySelector('.history-empty'))).toBe('Ancora niente qui. Segna i pasti nella Dieta: giorno per giorno, qui resta cosa hai mangiato.');
  });

  it('se la lettura fallisce lo dice; tirando giu\' si riprova', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let volte = 0;
    const { root, pulito, fixture, c, servizio, sezioni } = await monta(async () => { if (volte++ === 0) throw new Error('offline'); return giorni; });
    expect(pulito(root.querySelector('.history-empty'))).toBe('Non riesco a leggere lo storico. Controlla la connessione e tira giù la pagina per riprovare.');
    const fatto = vi.fn();
    await c.aggiorna({ target: { complete: fatto } } as unknown as Event);
    fixture.detectChanges();
    expect(servizio.elenco).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.history-empty')).toBeNull();
    expect(sezioni()).toEqual(['Questa settimana', '19 – 25 ott']);
  });
});
