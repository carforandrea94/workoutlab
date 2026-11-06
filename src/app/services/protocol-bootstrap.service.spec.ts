import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DietDataService } from './diet-data.service';
import { WorkoutDataService } from './workout-data.service';
import { ProtocolBootstrapService } from './protocol-bootstrap.service';

/** Il protocollo attivo arriva alla Dieta coi piani e col tipo: ON/OFF o ciclica. */
describe('ProtocolBootstrapService — il tipo di dieta', () => {
  function monta(attivo: any) {
    const dieta = new DietDataService();
    const servizio = new ProtocolBootstrapService(
      { currentUser: signal({ uid: 'u1' }) } as any,
      { changed$: new Subject<void>(), getActive: vi.fn(async () => attivo) } as any,
      { applyProtocol: vi.fn(), clear: vi.fn(), infoNote: '', protocolName: '' } as any,
      dieta,
      { recomputeWeek: vi.fn() } as any,
      { applyGoal: vi.fn() } as any
    );
    return { servizio, dieta };
  }
  const protocollo = (extra: any = {}) => ({
    name: 'P', infoNote: '', running: null, workout: { days: [], weekPlan: [], programStart: '2026-10-01' },
    diet: [{ id: 'g1', name: 'Giorno 1', meals: [] }], ...extra
  });

  it('una dieta ciclica arriva col suo primo giorno', async () => {
    const { servizio, dieta } = monta(protocollo({ dietType: 'ciclica', dietCycleStart: '2026-10-20' }));
    await servizio.reload();
    expect(dieta.diet.map(p => p.id)).toEqual(['g1']);
    expect(dieta.ciclo()).toEqual({ tipo: 'ciclica', inizio: '2026-10-20' });
  });

  it('un protocollo senza tipo e\' ON/OFF, come prima', async () => {
    const { servizio, dieta } = monta(protocollo());
    await servizio.reload();
    expect(dieta.ciclo()).toEqual({ tipo: 'onoff', inizio: null });
  });

  it('senza protocollo attivo la dieta torna vuota e ON/OFF', async () => {
    const { servizio, dieta } = monta(null);
    dieta.applyDiet([{ id: 'x', name: 'X', meals: [] }], { tipo: 'ciclica', inizio: '2026-10-20' });
    await servizio.reload();
    expect(dieta.diet).toEqual([]);
    expect(dieta.ciclo()).toEqual({ tipo: 'onoff', inizio: null });
  });
});

/** L'id del protocollo attivo serve a chi deve completarlo (la Dieta senza piani): c'e' finche' il protocollo c'e'. */
describe('ProtocolBootstrapService — l\'id del protocollo attivo', () => {
  function monta(attivo: any) {
    const scheda = new WorkoutDataService();
    const servizio = new ProtocolBootstrapService(
      { currentUser: signal({ uid: 'u1' }) } as any,
      { changed$: new Subject<void>(), getActive: vi.fn(async () => attivo) } as any,
      scheda,
      new DietDataService(),
      { recomputeWeek: vi.fn() } as any,
      { applyGoal: vi.fn() } as any
    );
    return { servizio, scheda };
  }
  const attivo = { id: 'p9', name: 'P', infoNote: '', running: null, workout: { days: [], weekPlan: [], programStart: '2026-10-01' }, diet: [] };

  it('arriva con il protocollo attivo', async () => {
    const { servizio, scheda } = monta(attivo);
    expect(scheda.protocolId).toBe('');
    await servizio.reload();
    expect(scheda.protocolId).toBe('p9');
  });

  it('se il protocollo sparisce (eliminato o disattivato) l\'id sparisce con lui', async () => {
    const { servizio, scheda } = monta(null);
    scheda.protocolId = 'p9';
    await servizio.reload();
    expect(scheda.protocolId).toBe('');
  });
});
