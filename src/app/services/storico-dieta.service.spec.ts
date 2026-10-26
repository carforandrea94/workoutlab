import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock condivisa: vedi src/test-support/firestore-mock.ts.
vi.mock('firebase/firestore', async () => (await import('../../test-support/firestore-mock')).firestoreMock);

import { mockDocs } from '../../test-support/firestore-mock';
import type { StoricoDietaService } from './storico-dieta.service';

/** Lo storico della dieta su Firestore: un documento per giorno, un piano per chiave. */
describe('StoricoDietaService', () => {
  let service: StoricoDietaService;
  let firestore: any;

  beforeEach(async () => {
    mockDocs.clear();
    // Ricaricato dopo la mock: un altro file potrebbe averlo gia' legato a firestore vero.
    vi.resetModules();
    firestore = await import('firebase/firestore');
    const { StoricoDietaService } = await import('./storico-dieta.service');
    service = new StoricoDietaService(
      { db: {} } as any,
      { currentUser: () => ({ uid: 'u1' }) } as any,
      { run: (p: Promise<any>) => p } as any
    );
  });

  it('salva il piano del giorno nel documento di quel giorno, unendolo agli altri piani', async () => {
    const raccolte = vi.spyOn(firestore, 'collection');
    const scritture = vi.spyOn(firestore, 'setDoc');
    const piano = { nome: 'Giorno ON', pasti: [{ id: 'm1', nome: 'Colazione', fatto: true, alimenti: [], integratori: [], combinazione: undefined }] };
    await service.salva('2026-10-26', 'on', piano as any);
    expect(raccolte.mock.calls[0].slice(1)).toEqual(['users', 'u1', 'giorniDieta']);
    const [ref, dati, opzioni] = scritture.mock.calls[0] as any[];
    expect(ref.id).toBe('2026-10-26');
    // Niente undefined: Firestore rifiuterebbe tutta la scrittura.
    expect(dati).toStrictEqual({ date: '2026-10-26', piani: { on: { nome: 'Giorno ON', pasti: [{ id: 'm1', nome: 'Colazione', fatto: true, alimenti: [], integratori: [] }] } } });
    expect(opzioni).toEqual({ merge: true });
  });

  it('l\'elenco: i giorni dal piu\' recente, letti e ripuliti; un documento rotto si salta', async () => {
    mockDocs.set('2026-10-20', { date: '2026-10-20', piani: {} });
    mockDocs.set('2026-10-26', { date: '2026-10-26', piani: { on: { nome: 'Giorno ON', pasti: [{ nome: 'Pranzo', fatto: true }] } } });
    mockDocs.set('rotto', { date: 'boh' });
    mockDocs.set('2026-10-22', { piani: {} });
    const giorni = await service.elenco();
    expect(giorni.map(g => g.date)).toEqual(['2026-10-26', '2026-10-22', '2026-10-20']);
    expect(giorni[0].piani['on'].pasti[0]).toEqual({ id: 'Pranzo', nome: 'Pranzo', fatto: true, alimenti: [], integratori: [] });
  });
});
