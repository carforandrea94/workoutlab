import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { AppStateService } from '../../services/app-state.service';
import { MeasurementDataService } from '../../services/measurement-data.service';
import { RunningStateService } from '../../services/running-state.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { WorkoutDataService } from '../../services/workout-data.service';
import { BilancioSettimanaComponent } from './bilancio-settimana.component';
import { GiornoService } from '../../core/giorno.service';

/**
 * La card "La settimana scorsa" in Account, disegnata davvero: una casella per
 * numero che c'e', la frase, e "Ho letto" che la chiude fino al lunedi' dopo.
 * Oggi e' lunedi' 26 ottobre 2026: la settimana scorsa va dal 19 al 25.
 */
describe('BilancioSettimanaComponent', () => {
  afterEach(() => vi.useRealTimers());

  /** La lettura e' una catena di promesse che whenStable non aspetta: si lascia finire e si ridisegna. */
  async function disegna(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 0));
    fixture.detectChanges();
  }

  interface Dati {
    stato?: any;
    sedute?: { dayId: string; date: string }[];
    corse?: { date: string; durationMin: number }[];
    obiettivoCorsa?: number | null;
    storico?: { date: string; peso: string | null }[];
    giorni?: number;
  }

  async function monta(d: Dati = {}) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00'));
    const patchField = vi.fn(async (_k: string, _v: any) => {});
    TestBed.configureTestingModule({
      imports: [BilancioSettimanaComponent],
      providers: [
        ...providerPagina(),
        { provide: AppStateService, useValue: { load: async () => ({ bilancioLetto: null, pastiGiorni: null, obiettivo: null, ...d.stato }), patchField } },
        { provide: MeasurementDataService, useValue: {
          loadHistory: async () => d.storico ?? [],
          parseMeasureValue: (raw: string | null | undefined) => raw ? parseFloat(raw.replace(',', '.')) : null
        } },
        { provide: WeeklyProgressService, useValue: { refresh: async () => {}, sedute: () => d.sedute ?? [] } },
        { provide: RunningStateService, useValue: {
          refresh: async () => {},
          runs: signal((d.corse ?? []).map((run, i) => ({ id: `r${i}`, run }))),
          goal: signal(d.obiettivoCorsa === undefined ? { weeklyMinutes: 120 } : d.obiettivoCorsa === null ? null : { weeklyMinutes: d.obiettivoCorsa })
        } },
        { provide: WorkoutDataService, useValue: { days: Array.from({ length: d.giorni ?? 3 }, (_, i) => ({ id: `d${i + 1}` })) } }
      ]
    });
    const fixture = TestBed.createComponent(BilancioSettimanaComponent);
    await disegna(fixture);
    const root: HTMLElement = fixture.nativeElement;
    const pulito = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    const caselle = () => Array.from(root.querySelectorAll<HTMLElement>('.bil'));
    const casella = (nome: string) => caselle().find(c => pulito(c.querySelector('.bil-cap')) === nome) ?? null;
    return { fixture, root, pulito, caselle, casella, patchField, c: fixture.componentInstance };
  }

  const settimana = {
    sedute: [{ dayId: 'd1', date: '2026-10-19' }, { dayId: 'd2', date: '2026-10-22' }],
    corse: [{ date: '2026-10-20', durationMin: 40 }, { date: '2026-10-24', durationMin: 55 }],
    stato: { pastiGiorni: { '2026-10-19': { fatti: 3, totali: 3 }, '2026-10-20': { fatti: 2, totali: 3 } } },
    storico: [{ date: '2026-10-23', peso: '112,3' }, { date: '2026-10-20', peso: '112,5' }, { date: '2026-10-14', peso: '112,7' }]
  };

  it('una sezione col titolo, l\'intervallo e le quattro caselle', async () => {
    const { root, pulito, caselle, casella } = await monta(settimana);
    const sezione = root.querySelector('section.bilancio')!;
    expect(sezione.getAttribute('aria-labelledby')).toBe('bilancio-titolo');
    expect(pulito(root.querySelector('#bilancio-titolo'))).toBe('La settimana scorsa');
    expect(pulito(root.querySelector('.bilancio-testa p'))).toBe('19 – 25 ott');
    expect(caselle().map(c => pulito(c.querySelector('.bil-cap')))).toEqual(['Allenamenti', 'Corsa', 'Pasti seguiti', 'Peso medio']);
    expect(pulito(casella('Allenamenti')!.querySelector('.bil-val'))).toBe('2 di 3');
    expect(casella('Allenamenti')!.querySelector('ion-progress-bar')).not.toBeNull();
    expect(pulito(casella('Corsa')!.querySelector('.bil-val'))).toBe('95 di 120 min');
    expect(pulito(casella('Pasti seguiti')!.querySelector('.bil-val'))).toBe('5 di 6');
    expect(pulito(casella('Peso medio')!.querySelector('.bil-val'))).toBe('112,4 kg');
    expect(pulito(casella('Peso medio')!.querySelector('.bil-nota'))).toBe('0,3 kg in meno');
    expect(casella('Peso medio')!.querySelector('.bil-nota app-icona')).not.toBeNull();
  });

  it('le barre dicono cosa misurano', async () => {
    const { root } = await monta(settimana);
    expect(Array.from(root.querySelectorAll('ion-progress-bar')).map(b => b.getAttribute('aria-label'))).toEqual([
      'Allenamenti fatti su quelli previsti', 'Minuti di corsa sull\'obiettivo', 'Pasti seguiti sul piano'
    ]);
  });

  it('una casella senza dati non c\'e\', e l\'ultima dispari resta sola nella riga', async () => {
    const { caselle, pulito } = await monta({ sedute: settimana.sedute, obiettivoCorsa: null, storico: settimana.storico });
    expect(caselle().map(c => pulito(c.querySelector('.bil-cap')))).toEqual(['Allenamenti', 'Peso medio']);
  });

  it('la corsa senza obiettivo: i minuti, senza barra', async () => {
    const { casella, pulito } = await monta({ corse: settimana.corse, obiettivoCorsa: null });
    expect(pulito(casella('Corsa')!.querySelector('.bil-val'))).toBe('95 min');
    expect(casella('Corsa')!.querySelector('ion-progress-bar')).toBeNull();
  });

  it('l\'ultima casella dispari prende tutta la riga', async () => {
    // Come le altre guardie CSS: il modulo si carica per nome, fuori dal bundle.
    const nome = 'node:fs';
    const fs = await import(/* @vite-ignore */ nome);
    const css: string = fs.readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.bilancio-numeri\{display:grid;grid-template-columns:1fr 1fr;/);
    expect(css).toContain('.bilancio-numeri .bil:last-child:nth-child(odd){grid-column:1 / -1;}');
  });

  it('la scheda completa lo dice al posto della barra, e la frase lo ripete', async () => {
    const { casella, pulito, root } = await monta({
      sedute: [{ dayId: 'd1', date: '2026-10-19' }, { dayId: 'd2', date: '2026-10-21' }, { dayId: 'd3', date: '2026-10-23' }]
    });
    const a = casella('Allenamenti')!;
    expect(a.querySelector('ion-progress-bar')).toBeNull();
    expect(pulito(a.querySelector('.bil-nota.ok'))).toBe('scheda completa');
    expect(pulito(root.querySelector('.bilancio-frase'))).toBe('Scheda completa: tutti gli allenamenti della settimana fatti.');
  });

  it('col traguardo, la frase legge il peso medio', async () => {
    const { pulito, root } = await monta({ ...settimana, stato: { obiettivo: { tipo: 'grasso', peso: 110, entro: null } } });
    expect(pulito(root.querySelector('.bilancio-frase'))).toBe('Il peso medio scende di 0,3 kg a settimana: a questo passo arrivi a 110 kg in circa 8 settimane.');
  });

  it('senza niente da dire, niente frase', async () => {
    const { root } = await monta({ sedute: settimana.sedute, obiettivoCorsa: null });
    expect(root.querySelector('.bilancio-frase')).toBeNull();
  });

  it('peso fermo: "come la settimana prima", senza freccia', async () => {
    const { casella, pulito } = await monta({ storico: [{ date: '2026-10-21', peso: '80' }, { date: '2026-10-14', peso: '80' }] });
    const nota = casella('Peso medio')!.querySelector('.bil-nota')!;
    expect(pulito(nota)).toBe('come la settimana prima');
    expect(nota.querySelector('app-icona')).toBeNull();
  });

  it('una settimana senza niente di registrato non ha card', async () => {
    const { root } = await monta({ sedute: [{ dayId: 'd1', date: '2026-10-26' }] });
    expect(root.querySelector('section.bilancio')).toBeNull();
  });

  it('gia\' letta, non torna; quella dopo si', async () => {
    const { root } = await monta({ ...settimana, stato: { ...settimana.stato, bilancioLetto: '2026-10-19' } });
    expect(root.querySelector('section.bilancio')).toBeNull();
    TestBed.resetTestingModule();
    const { root: dopo } = await monta({ ...settimana, stato: { ...settimana.stato, bilancioLetto: '2026-10-12' } });
    expect(dopo.querySelector('section.bilancio')).not.toBeNull();
  });

  it('"Ho letto" la chiude e lo salva col lunedi\' della settimana', async () => {
    const { root, fixture, patchField } = await monta(settimana);
    const tasto = root.querySelector<HTMLElement>('ion-button.bilancio-letto')!;
    expect(tasto.textContent!.trim()).toBe('Ho letto');
    // ion-button sposta aria-label dall'host al <button> interno: si legge dove sta.
    const etichetta = tasto.getAttribute('aria-label') ?? tasto.shadowRoot?.querySelector('button')?.getAttribute('aria-label') ?? (tasto as any).inheritedAttributes?.['aria-label'];
    expect(etichetta).toBe('Ho letto il bilancio della settimana');
    tasto.click();
    fixture.detectChanges();
    expect(patchField).toHaveBeenCalledWith('bilancioLetto', '2026-10-19');
    expect(root.querySelector('section.bilancio')).toBeNull();
  });

  it('se la lettura fallisce, niente card e nessun errore in pagina', async () => {
    const errore = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T10:00:00'));
    TestBed.configureTestingModule({
      imports: [BilancioSettimanaComponent],
      providers: [
        ...providerPagina(),
        { provide: AppStateService, useValue: { load: async () => { throw new Error('offline'); }, patchField: vi.fn() } },
        { provide: MeasurementDataService, useValue: { loadHistory: async () => [], parseMeasureValue: () => null } },
        { provide: WeeklyProgressService, useValue: { refresh: async () => {}, sedute: () => settimana.sedute } },
        { provide: RunningStateService, useValue: { refresh: async () => {}, runs: signal([]), goal: signal(null) } },
        { provide: WorkoutDataService, useValue: { days: [{ id: 'd1' }] } }
      ]
    });
    const fixture = TestBed.createComponent(BilancioSettimanaComponent);
    await disegna(fixture);
    expect(fixture.nativeElement.querySelector('section.bilancio')).toBeNull();
    expect(errore).toHaveBeenCalled();
    errore.mockRestore();
  });

  it('Account aperta da domenica a lunedi\': a mezzanotte il bilancio passa alla settimana appena finita', async () => {
    const { root, fixture, pulito, casella } = await monta({
      ...settimana,
      sedute: [...settimana.sedute, { dayId: 'd3', date: '2026-10-28' }]
    });
    const letture = vi.spyOn(TestBed.inject(AppStateService), 'load');
    expect(pulito(root.querySelector('.bilancio-testa p'))).toBe('19 – 25 ott');

    // Lo stesso giorno non rilegge niente.
    TestBed.inject(GiornoService).controlla();
    expect(letture).not.toHaveBeenCalled();

    vi.setSystemTime(new Date(2026, 10, 2, 0, 0, 1));
    TestBed.inject(GiornoService).controlla();
    await disegna(fixture);
    expect(letture).toHaveBeenCalledTimes(1);
    expect(pulito(root.querySelector('.bilancio-testa p'))).toBe('26 ott – 1 nov');
    expect(pulito(casella('Allenamenti')!.querySelector('.bil-val'))).toBe('1 di 3');
  });
});
