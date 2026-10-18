import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutSessionsService } from '../../services/workout-sessions.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { SchedaInfoComponent } from './scheda-info.component';

/**
 * Info con le liste delle tab: la progressione dell'onda e' una riga per
 * settimana (serie per ripetizioni a destra) e quella in corso lo dice; lo
 * storico e' fatto di righe nome-valore; i consigli sono righe, non card.
 */
describe('SchedaInfoComponent — disegno vero', () => {
  async function monta(opz: { sedute?: any[] } = {}) {
    TestBed.configureTestingModule({
      imports: [SchedaInfoComponent],
      providers: [
        ...providerPagina(),
        { provide: WorkoutStateService, useValue: { currentWeek: 2 } },
        { provide: WorkoutDataService, useValue: {
          hasCustomProtocol: true, infoNote: 'Bere acqua.',
          WEEK_PLAN: [{ sets: 4, reps: 10 }, { sets: 4, reps: 8 }, { sets: 3, reps: 10 }],
          days: [{ id: 'd1', label: 'Petto', ex: [{ scheme: 'wave' }] }]
        } },
        { provide: WorkoutSessionsService, useValue: { listAll: vi.fn(async () => opz.sedute ?? []) } }
      ]
    });
    const fixture = TestBed.createComponent(SchedaInfoComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loadingHistory).toBe(false));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const testo = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    return { root, testo };
  }

  it('i gruppi sono liste inset con la loro intestazione, sotto la testata', async () => {
    const { root, testo } = await monta();
    expect(root.querySelector('ion-content')!.classList.contains('liste-ios')).toBe(true);
    expect(Array.from(root.querySelectorAll('ion-list-header.sezione')).map(testo))
      .toEqual(['Note del programma', 'Onda di carico', 'Il programma', 'Consigli generali']);
    expect(root.querySelector('.infocard, .infowave, .consigli')).toBeNull();
  });

  it('una riga per settimana dell\'onda, e solo quella in corso dice "Adesso"', async () => {
    const { root, testo } = await monta();
    const righe = Array.from(root.querySelectorAll('ion-list.info-onda ion-item'));
    expect(righe.map(r => testo(r.querySelector('h2')))).toEqual(['Settimana 1', 'Settimana 2 Adesso', 'Settimana 3']);
    expect(righe.map(r => testo(r.querySelector('ion-note')))).toEqual(['4×10rip.', '4×8rip.', '3×10rip.']);
    expect(righe.map(r => r.getAttribute('aria-current'))).toEqual([null, 'step', null]);
  });

  it('lo storico in righe nome-valore', async () => {
    const { root, testo } = await monta({ sedute: [{ session: { date: '2026-10-15' } }, { session: { date: '2026-10-10' } }] });
    const righe = Array.from(root.querySelectorAll('ion-list.info-storico ion-item'));
    expect(righe.map(r => testo(r.querySelector('h2')))).toEqual(['Allenamenti completati', 'Ultimo allenamento']);
    expect(testo(righe[0].querySelector('ion-note'))).toBe('2');
    expect(testo(righe[1].querySelector('ion-note'))).toContain('15 ottobre 2026');
  });

  it('senza allenamenti lo dice in una riga, al posto dei numeri', async () => {
    const { root, testo } = await monta();
    expect(testo(root.querySelector('ion-list.info-storico'))).toContain('Non hai ancora registrato allenamenti');
  });

  it('i consigli sono righe; quello sugli esercizi wave c\'e\' perche\' il programma ne ha', async () => {
    const { root } = await monta();
    const consigli = root.querySelectorAll('ion-list.info-consigli ion-item');
    expect(consigli.length).toBe(5);
  });
});
