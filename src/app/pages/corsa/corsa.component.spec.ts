import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavController } from '@ionic/angular';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { todayLocalISO } from '../../core/utils/date.util';
import { RunningStateService } from '../../services/running-state.service';
import { CorsaComponent } from './corsa.component';

/** Una data locale, n giorni prima di oggi. */
const giorniFa = (n: number) => {
  const d = new Date(todayLocalISO() + 'T00:00:00'); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * La Corsa con le liste di Ionic: l'obiettivo della settimana come righe con
 * la barra, e lo storico come fisarmonica raggruppata, con la settimana in
 * corso sempre aperta.
 */
describe('CorsaComponent — obiettivo e settimane', () => {
  function monta(opz: { goal?: any } = {}) {
    const runs = [
      { id: 'r1', run: { date: todayLocalISO(), durationMin: 35, type: 'lento', effort: 'facile' } },
      { id: 'r2', run: { date: giorniFa(8), durationMin: 45, type: 'lento', effort: 'dura' } }
    ];
    const nav = { navigateForward: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CorsaComponent],
      providers: [
        ...providerPagina(),
        { provide: NavController, useValue: nav },
        { provide: RunningStateService, useValue: {
          runs: signal(runs), goal: signal(opz.goal === undefined ? { weeklyMinutes: 120, weeklyRuns: 3, note: 'Corsa lenta.' } : opz.goal),
          loaded: signal(true), thisWeek: signal({ minutes: 35, runs: 1 }), refresh: vi.fn(async () => {})
        } }
      ]
    });
    const fixture = TestBed.createComponent(CorsaComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const settimane = () => Array.from(root.querySelectorAll<HTMLElement & { value?: string; readonly?: boolean }>('ion-accordion.week'));
    const gruppo = () => root.querySelector<HTMLElement & { value?: string[]; multiple?: boolean }>('ion-accordion-group.settimane')!;
    const testo = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, '').trim() ?? null;
    return { fixture, root, nav, settimane, gruppo, testo, c: fixture.componentInstance };
  }

  it('l\'obiettivo: minuti e uscite fatti su previsti, con la barra che lo dice anche a parole', () => {
    const { root, testo } = monta();
    expect(testo(root.querySelector('ion-item.obiettivo-minuti ion-note'))).toBe('35/120min');
    expect(testo(root.querySelector('ion-item.obiettivo-uscite ion-note'))).toBe('1/3');
    expect(root.querySelector('ion-item.obiettivo-minuti ion-progress-bar')!.getAttribute('aria-valuetext')).toBe('35 minuti su 120');
    expect(root.querySelector('ion-item.obiettivo-nota p')!.textContent!.trim()).toBe('Corsa lenta.');
  });

  it('senza obiettivo il gruppo dell\'obiettivo non c\'e\'', () => {
    const { root } = monta({ goal: null });
    expect(root.querySelector('ion-list.obiettivo')).toBeNull();
  });

  it('le settimane sono una fisarmonica raggruppata: piu\' aperte insieme, quella in corso sempre aperta e non chiudibile', () => {
    const { settimane, gruppo, c } = monta();
    const [corrente, passata] = settimane();
    expect(gruppo().getAttribute('expand')).toBe('inset');
    expect(gruppo().multiple).toBe(true);
    expect(corrente.classList.contains('current')).toBe(true);
    expect(corrente.readonly).toBe(true);
    expect(passata.readonly).toBe(false);
    expect(gruppo().value).toEqual([corrente.value]);
    expect(c.aperte()).toEqual([corrente.value]);
  });

  it('aperta una settimana passata resta aperta insieme a quella in corso; chiudendo tutto, quella in corso resta', () => {
    const { settimane, c, fixture, gruppo } = monta();
    const [corrente, passata] = settimane();
    c.settimaneCambiate(new CustomEvent('ionChange', { detail: { value: [corrente.value, passata.value] } }));
    fixture.detectChanges();
    expect(gruppo().value).toEqual([corrente.value, passata.value]);
    c.settimaneCambiate(new CustomEvent('ionChange', { detail: { value: [] } }));
    fixture.detectChanges();
    expect(gruppo().value).toEqual([corrente.value]);
  });

  it('un\'uscita e\' una riga: giorno e tipo, fatica sotto, minuti a destra; toccata si modifica', () => {
    const { settimane, testo, nav } = monta();
    const riga = settimane()[0].querySelector<HTMLElement>('ion-item.runline')!;
    expect(riga.querySelector('ion-label p')!.textContent!.trim()).toBe('Facile');
    expect(testo(riga.querySelector('ion-note'))).toBe('35min');
    // La fatica si legge anche dalla misura del pallino, non solo dal colore.
    expect(riga.querySelector<HTMLElement>('.runline-dot')!.style.width).toBe('5px');
    expect(settimane()[1].querySelector<HTMLElement>('.runline-dot')!.style.width).toBe('11px');
    riga.click();
    expect(nav.navigateForward).toHaveBeenCalledWith(['/corsa/nuova'], { queryParams: { id: 'r1' } });
  });

  it('"Registra un\'uscita" e\' una riga d\'azione senza chevron, e parte dalla data giusta', () => {
    const { settimane, nav, c } = monta();
    const [corrente, passata] = settimane();
    const aggiungi = corrente.querySelector<HTMLElement & { detail?: boolean }>('ion-item.runadd')!;
    expect(aggiungi.textContent!.trim()).toBe('Registra un\'uscita');
    expect(aggiungi.detail).toBe(false);
    aggiungi.click();
    expect(nav.navigateForward).toHaveBeenLastCalledWith(['/corsa/nuova'], { queryParams: { date: todayLocalISO() } });
    passata.querySelector<HTMLElement>('ion-item.runadd')!.click();
    const domenica = c.history().weeks.find(w => !w.isCurrent)!.sundayISO;
    expect(nav.navigateForward).toHaveBeenLastCalledWith(['/corsa/nuova'], { queryParams: { date: domenica } });
  });
});
