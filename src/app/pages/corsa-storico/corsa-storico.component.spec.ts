import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { todayLocalISO } from '../../core/utils/date.util';
import { RunningStateService } from '../../services/running-state.service';
import { CorsaStoricoComponent } from './corsa-storico.component';

/** Una data locale, n giorni prima di oggi. */
const giorniFa = (n: number) => {
  const d = new Date(todayLocalISO() + 'T00:00:00'); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Lo storico della corsa, una pagina dentro la tab: le settimane passate
 * come fisarmonica raggruppata di Ionic. La settimana in corso non c'e',
 * sta nella Corsa.
 */
describe('CorsaStoricoComponent — le settimane passate', () => {
  function monta(opz: { goal?: any; runs?: any[]; caricate?: boolean } = {}) {
    const runs = opz.runs ?? [
      { id: 'r1', run: { date: todayLocalISO(), durationMin: 35, type: 'lento', effort: 'facile' } },
      // Sette giorni fa e' sempre nella settimana prima; otto, il lunedi', e' due settimane fa.
      { id: 'r2', run: { date: giorniFa(7), durationMin: 45, type: 'lento', effort: 'dura' } }
    ];
    const nav = { navigateForward: vi.fn() };
    const refresh = vi.fn(async () => {});
    TestBed.configureTestingModule({
      imports: [CorsaStoricoComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: RunningStateService, useValue: {
          runs: signal(runs), goal: signal(opz.goal === undefined ? { weeklyMinutes: 120, weeklyRuns: 3 } : opz.goal),
          loaded: signal(opz.caricate ?? true), thisWeek: signal({ minutes: 35, runs: 1 }), refresh
        } }
      ]
    });
    const fixture = TestBed.createComponent(CorsaStoricoComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const settimane = () => Array.from(root.querySelectorAll<HTMLElement & { value?: string }>('ion-accordion.week'));
    const gruppo = () => root.querySelector<HTMLElement & { value?: string[]; multiple?: boolean }>('ion-accordion-group.settimane')!;
    return { fixture, root, nav, refresh, settimane, gruppo, c: fixture.componentInstance };
  }

  it('e\' una pagina interna: la freccia torna alla Corsa, il titolo e\' Storico', () => {
    const { root } = monta();
    expect(root.querySelector('ion-back-button')!.getAttribute('defaultHref')).toBe('/corsa');
    expect(root.querySelector('ion-title .navtitle')!.textContent!.trim()).toBe('Storico');
  });

  it('solo le settimane passate, che si aprono toccandole, anche piu\' d\'una', () => {
    const { settimane, gruppo, c, fixture } = monta();
    expect(settimane().length).toBe(1);
    expect(settimane()[0].value).toBe(c.passate()[0].mondayISO);
    expect(c.passate().every(w => !w.isCurrent)).toBe(true);
    expect(gruppo().getAttribute('expand')).toBe('inset');
    expect(gruppo().multiple).toBe(true);
    expect(gruppo().value).toEqual([]);
    c.settimaneCambiate(new CustomEvent('ionChange', { detail: { value: [settimane()[0].value] } }));
    fixture.detectChanges();
    expect(gruppo().value).toEqual([settimane()[0].value]);
    c.settimaneCambiate(new CustomEvent('ionChange', { detail: { value: [] } }));
    fixture.detectChanges();
    expect(gruppo().value).toEqual([]);
  });

  it('la settimana: intervallo, uscite, minuti e la barra sull\'obiettivo', () => {
    const { settimane, c } = monta();
    const w = settimane()[0];
    expect(w.querySelector('ion-item[slot=header] h2')!.textContent!.trim()).toBe(c.passate()[0].label);
    expect(w.querySelector('ion-item[slot=header] p')!.textContent!.trim()).toBe('1 uscita');
    expect(w.querySelector('ion-item[slot=header] ion-note')!.textContent!.replace(/\s+/g, '')).toBe('45min');
    expect(w.querySelector('ion-progress-bar')).not.toBeNull();
    expect(c.pct(c.passate()[0])).toBe(37.5);
    expect(c.reached(c.passate()[0])).toBe(false);
  });

  it('senza obiettivo la barra non c\'e\'', () => {
    const { settimane } = monta({ goal: null });
    expect(settimane()[0].querySelector('ion-progress-bar')).toBeNull();
  });

  it('una corsa e\' una riga: fatica col colore e con la misura del pallino; toccata si modifica', () => {
    const { settimane, nav } = monta();
    const riga = settimane()[0].querySelector<HTMLElement>('ion-item.runline')!;
    expect(riga.querySelector('ion-label p')!.textContent!.trim()).toBe('Dura');
    expect(riga.querySelector<HTMLElement>('.runline-dot')!.style.width).toBe('11px');
    riga.click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/corsa/nuova'], { queryParams: { id: 'r2' } });
  });

  it('"Registra corsa" dentro una settimana parte dalla sua domenica', () => {
    const { settimane, nav, c } = monta();
    const aggiungi = settimane()[0].querySelector<HTMLElement & { detail?: boolean }>('ion-item.runadd')!;
    expect(aggiungi.textContent!.trim()).toBe('Registra corsa');
    expect(aggiungi.detail).toBe(false);
    aggiungi.click();
    expect(nav.navigateForward).toHaveBeenLastCalledWith(['/corsa/nuova'], { queryParams: { date: c.passate()[0].sundayISO } });
  });

  it('dodici settimane, poi "Mostra le altre"', () => {
    // Una corsa venti settimane fa: in mezzo, settimane vuote.
    const { root, c, fixture } = monta({ runs: [{ id: 'r9', run: { date: giorniFa(140), durationMin: 30, type: 'lento', effort: 'giusta' } }] });
    expect(c.passate().length).toBe(12);
    const altre = root.querySelector<HTMLElement>('ion-button.week-more')!;
    expect(altre.textContent!.trim()).toBe(`Mostra le altre ${c.history().hidden} settimane`);
    altre.click();
    fixture.detectChanges();
    expect(c.passate().length).toBeGreaterThan(12);
    expect(root.querySelector('ion-button.week-more')).toBeNull();
  });

  it('senza settimane passate lo dice, e dice dove sono le corse di questa', () => {
    const { root } = monta({ runs: [{ id: 'r1', run: { date: todayLocalISO(), durationMin: 35, type: 'lento', effort: 'facile' } }] });
    expect(root.querySelector('ion-accordion-group')).toBeNull();
    expect(root.querySelector('.history-empty')!.textContent!.trim()).toBe('Nessuna corsa nelle settimane passate. Quelle di questa settimana sono nella Corsa.');
  });

  it('aperta da un link diretto rilegge le corse; arrivando dalla Corsa no', () => {
    expect(monta({ caricate: false }).refresh).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(monta().refresh).not.toHaveBeenCalled();
  });
});

/** A mezzanotte fra domenica e lunedi' la settimana appena finita entra nello storico, da sola. */
describe('CorsaStoricoComponent — a mezzanotte', () => {
  afterEach(() => vi.useRealTimers());

  it('la settimana di domenica diventa passata senza toccare niente', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 25, 23, 59, 30));
    TestBed.configureTestingModule({
      imports: [CorsaStoricoComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: { navigateForward: vi.fn() } },
        { provide: RunningStateService, useValue: {
          runs: signal([
            { id: 'r1', run: { date: '2026-10-25', durationMin: 35, type: 'lento', effort: 'facile' } },
            { id: 'r2', run: { date: '2026-10-14', durationMin: 45, type: 'lento', effort: 'dura' } }
          ]),
          goal: signal(null), loaded: signal(true), thisWeek: signal({ minutes: 35, runs: 1 }), refresh: vi.fn(async () => {})
        } }
      ]
    });
    const fixture = TestBed.createComponent(CorsaStoricoComponent);
    fixture.detectChanges();
    const settimane = () => Array.from(fixture.nativeElement.querySelectorAll('ion-accordion.week')).map((a: any) => a.value);
    expect(settimane()).toEqual(['2026-10-12']);

    vi.advanceTimersByTime(31_000);
    expect(settimane()).toEqual(['2026-10-19', '2026-10-12']);
  });
});
