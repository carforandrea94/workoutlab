import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { SchedaListComponent } from './scheda-list.component';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { AppStateService } from '../../services/app-state.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';

/**
 * La scheda non lega i giorni ai giorni della settimana: "oggi" non esiste, esiste
 * "il prossimo". L'elenco lo dice con il numero pieno sul primo giorno non ancora
 * fatto questa settimana, e con "In corso" sul giorno della sessione.
 */
describe('SchedaListComponent — da dove si parte', () => {
  const giorni = [
    { id: 'd1', label: 'Petto e tricipiti', rec: '90"', ex: [{}, {}] },
    { id: 'd2', label: 'Schiena e bicipiti', rec: '90"', ex: [{}] },
    { id: 'd3', label: 'Gambe', rec: '120"', ex: [{}, {}, {}] }
  ];

  function monta(opzioni: { fatti?: string[]; sessioneSu?: string | null; bozze?: string[] } = {}) {
    const fatti = new Set(opzioni.fatti ?? []);
    const attiva = signal<any>(opzioni.sessioneSu ? { dayId: opzioni.sessioneSu } : null);
    TestBed.configureTestingModule({
      imports: [SchedaListComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutDataService, useValue: { days: giorni, WEEK_PLAN: [{ sets: 4, reps: 10 }], hasCustomProtocol: false, protocolName: '' } },
        { provide: WorkoutStateService, useValue: { currentWeek: 1 } },
        { provide: AppStateService, useValue: { load: async () => ({ workoutDrafts: Object.fromEntries((opzioni.bozze ?? []).map(d => [d, {}])) }) } },
        { provide: WeeklyProgressService, useValue: { refresh: vi.fn(), isDone: (id: string) => fatti.has(id) } },
        { provide: WorkoutSessionStateService, useValue: { activeSession: attiva, isActiveForDay: (id: string) => attiva()?.dayId === id } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaListComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const righe = () => Array.from(root.querySelectorAll<HTMLElement>('ion-item.cardrow'));
    const badgePieni = () => righe().map(r => r.querySelector('.badge')!.classList.contains('next'));
    const tag = (i: number) => Array.from(righe()[i].querySelectorAll('.meta-tag')).map(t => t.textContent!.trim());
    return { fixture, root, righe, badgePieni, tag };
  }

  it('a inizio settimana il primo giorno e\' il prossimo: numero pieno e la parola', () => {
    const { badgePieni, tag } = monta();
    expect(badgePieni()).toEqual([true, false, false]);
    expect(tag(0)).toEqual(['Prossimo']);
    expect(tag(1)).toEqual([]);
  });

  it('i giorni gia\' fatti non sono il prossimo: tocca il primo che manca', () => {
    const { badgePieni, tag } = monta({ fatti: ['d1'] });
    expect(badgePieni()).toEqual([false, true, false]);
    expect(tag(1)).toEqual(['Prossimo']);
    expect(tag(0)).toEqual([]);
  });

  it('salta anche un giorno non fatto in mezzo: conta l\'ordine del protocollo, non quello in cui si e\' allenato', () => {
    const { badgePieni } = monta({ fatti: ['d1', 'd3'] });
    expect(badgePieni()).toEqual([false, true, false]);
  });

  it('con tutti i giorni fatti non c\'e\' nessun prossimo', () => {
    const { badgePieni, tag } = monta({ fatti: ['d1', 'd2', 'd3'] });
    expect(badgePieni()).toEqual([false, false, false]);
    expect([0, 1, 2].flatMap(tag)).toEqual([]);
  });

  it('con una sessione in corso il segno e\' suo, e il prossimo sparisce: un solo giorno pieno', () => {
    const { badgePieni, tag } = monta({ sessioneSu: 'd2' });
    expect(badgePieni()).toEqual([false, true, false]);
    expect(tag(1)).toEqual(['● In corso']);
    expect(tag(0)).toEqual([]);
  });

  it('una bozza si vede anche sul giorno che tocca', async () => {
    const { tag, fixture } = monta({ bozze: ['d1'] });
    // le bozze arrivano dall'account, dopo il primo disegno
    await vi.waitFor(() => expect(fixture.componentInstance.hasDraft('d1')).toBe(true));
    fixture.detectChanges();
    expect(tag(0)).toEqual(['Prossimo', '● bozza']);
  });
});
