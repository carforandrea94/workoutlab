import { TestBed } from '@angular/core/testing';
import { WorkoutStateService } from './workout-state.service';

/**
 * La settimana di protocollo e' quella del calendario, da lunedi' a domenica:
 * il numero scatta ogni lunedi', non a sette giorni dalla data di inizio.
 * Nelle date qui sotto: 2026-07-05 e' una domenica, 2026-07-06 un lunedi'.
 */
describe('WorkoutStateService.weekNumberForDate', () => {
  let service: WorkoutStateService;

  beforeEach(() => {
    const appStateStub = {} as any;
    const authStub = { authReady: () => false, currentUser: () => null } as any;
    service = TestBed.runInInjectionContext(() =>
      new WorkoutStateService(appStateStub, authStub)
    );
  });

  it("restituisce un numero <= 0 per una data precedente all'inizio del programma", () => {
    expect(service.weekNumberForDate('2026-06-28', '2026-07-06')).toBeLessThanOrEqual(0);
  });

  it('restituisce 1 per il giorno esatto di inizio del programma', () => {
    expect(service.weekNumberForDate('2026-07-06', '2026-07-06')).toBe(1);
  });

  it('resta nella stessa settimana fino alla domenica compresa', () => {
    // lunedi' 6, mercoledi' 8, domenica 12: stessa settimana di calendario
    expect(service.weekNumberForDate('2026-07-08', '2026-07-06')).toBe(1);
    expect(service.weekNumberForDate('2026-07-12', '2026-07-06')).toBe(1);
  });

  it('scatta alla settimana successiva il lunedi', () => {
    expect(service.weekNumberForDate('2026-07-13', '2026-07-06')).toBe(2);
  });

  it("con un protocollo iniziato di domenica, il lunedi' dopo e' gia' settimana 2", () => {
    // Il vecchio conteggio a blocchi di sette giorni dall'inizio teneva insieme
    // domenica e i sei giorni successivi: la settimana scattava di sabato.
    expect(service.weekNumberForDate('2026-07-05', '2026-07-05')).toBe(1);
    expect(service.weekNumberForDate('2026-07-06', '2026-07-05')).toBe(2);
    expect(service.weekNumberForDate('2026-07-11', '2026-07-05')).toBe(2);
  });

  it('non applica alcun clamp superiore oltre la durata pianificata del protocollo', () => {
    expect(service.weekNumberForDate('2026-09-07', '2026-07-06')).toBe(10);
  });

  it('la settimana corrente segue lo stesso calendario ed e\' limitata alla durata del protocollo', () => {
    const oggi = new Date();
    const lunedi = new Date(oggi);
    lunedi.setDate(oggi.getDate() - ((oggi.getDay() + 6) % 7));
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Protocollo iniziato questo lunedi': si e' in settimana 1.
    service.recomputeWeek(iso(lunedi), 8);
    expect(service.currentWeek).toBe(1);

    // Iniziato due lunedi' fa: settimana 3.
    const dueSettimanePrima = new Date(lunedi);
    dueSettimanePrima.setDate(lunedi.getDate() - 14);
    service.recomputeWeek(iso(dueSettimanePrima), 8);
    expect(service.currentWeek).toBe(3);

    // Oltre la durata del protocollo resta all'ultima settimana pianificata.
    const moltoPrima = new Date(lunedi);
    moltoPrima.setDate(lunedi.getDate() - 70);
    service.recomputeWeek(iso(moltoPrima), 8);
    expect(service.currentWeek).toBe(8);
  });
});
