import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../core/services/auth.service';
import { prossimoPromemoria } from '../core/utils/promemoria.util';
import { WeeklyProgressService } from './weekly-progress.service';
import { WorkoutDataService } from './workout-data.service';
import { AMBIENTE, ARCHIVIO_PROMEMORIA, Ambiente, ArchivioPromemoria, CHIAVE_PUSH, PromemoriaService, chiaveTelefono } from './promemoria.service';

/**
 * Il servizio dei promemoria con un archivio in memoria, un service worker e
 * un telefono finti: cosa scrive, quando, e cosa non scrive.
 */
describe('PromemoriaService', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const endpoint = 'https://push.example/abc';
  const iscrizione = { endpoint, toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }) } as unknown as PushSubscription;

  interface Opzioni {
    chiave?: string;
    ambiente?: Partial<Ambiente>;
    swAttivo?: boolean;
    documento?: unknown;
    richiesta?: () => Promise<PushSubscription>;
    attuale?: PushSubscription | null;
    utente?: { uid: string } | null;
  }

  function monta(o: Opzioni = {}) {
    // Lunedi' 26 ottobre 2026 alle 9, ora locale.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
    const archivio = {
      leggi: vi.fn(async (_uid: string) => o.documento ?? null),
      unisci: vi.fn(async (_uid: string, _campi: Record<string, unknown>) => {}),
      aggiorna: vi.fn(async (_uid: string, _campi: Record<string, unknown>) => {}),
      togliTelefono: vi.fn(async (_uid: string, _chiave: string) => {})
    } satisfies ArchivioPromemoria;
    const dopoOgniLettura = vi.fn();
    const primaDiUscire = vi.fn();
    const requestSubscription = vi.fn(o.richiesta ?? (async () => iscrizione));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser: signal(o.utente === undefined ? { uid: 'u1' } : o.utente), primaDiUscire } },
        { provide: SwPush, useValue: { isEnabled: o.swAttivo ?? true, requestSubscription, subscription: of(o.attuale === undefined ? iscrizione : o.attuale) } },
        { provide: WeeklyProgressService, useValue: { dopoOgniLettura, doneDayIds: () => new Set(['d2', 'd1']), ultimaSeduta: () => '2026-10-24' } },
        { provide: WorkoutDataService, useValue: { days: [{ id: 'd1', label: 'Petto' }, { id: 'd2', label: 'Schiena' }, { id: 'd3', label: 'Gambe' }] } },
        { provide: CHIAVE_PUSH, useValue: o.chiave ?? 'chiave-pubblica' },
        { provide: ARCHIVIO_PROMEMORIA, useValue: archivio },
        { provide: AMBIENTE, useValue: () => ({ push: true, apple: false, installata: false, ...o.ambiente }) }
      ]
    });
    const s = TestBed.inject(PromemoriaService);
    return { s, archivio, dopoOgniLettura, primaDiUscire, requestSubscription };
  }

  const foto = {
    programma: [{ id: 'd1', label: 'Petto' }, { id: 'd2', label: 'Schiena' }, { id: 'd3', label: 'Gambe' }],
    fatti: { settimana: '2026-10-26', ids: ['d1', 'd2'] },
    ultimaSeduta: '2026-10-24'
  };
  const lmv = { attivo: false, giorni: [1, 3, 5], ora: '18:00' };

  describe('cosa permette il telefono', () => {
    it('con le push e il service worker si puo\'', () => {
      expect(monta().s.supporto()).toBe('ok');
    });

    it('senza la chiave del server non si puo\', comunque sia il telefono', () => {
      expect(monta({ chiave: '' }).s.supporto()).toBe('non-configurato');
    });

    it('su iPhone da Safari va installata; altrove non si puo\'', () => {
      expect(monta({ ambiente: { push: false, apple: true, installata: false } }).s.supporto()).toBe('installa');
      TestBed.resetTestingModule();
      expect(monta({ ambiente: { push: false, apple: true, installata: true } }).s.supporto()).toBe('non-supportato');
      TestBed.resetTestingModule();
      expect(monta({ ambiente: { push: false, apple: false } }).s.supporto()).toBe('non-supportato');
      TestBed.resetTestingModule();
      // Le push ci sono ma il service worker no (sviluppo, o non ancora registrato).
      expect(monta({ swAttivo: false }).s.supporto()).toBe('non-supportato');
    });
  });

  it('carica una volta sola, e quello che non si legge diventa il valore di partenza', async () => {
    const { s, archivio } = monta({ documento: { attivo: true, giorni: [2, 4], ora: '07:30', iscrizioni: {} } });
    expect(await s.carica()).toEqual({ attivo: true, giorni: [2, 4], ora: '07:30' });
    await s.carica();
    expect(archivio.leggi).toHaveBeenCalledTimes(1);
    expect(archivio.leggi).toHaveBeenCalledWith('u1');
  });

  describe('accendere', () => {
    it('iscrive il telefono con la chiave e scrive orario, prossimo, fotografia e telefono', async () => {
      const { s, archivio, requestSubscription } = monta();
      expect(await s.attiva(lmv)).toBe('ok');
      expect(requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'chiave-pubblica' });
      const [uid, campi] = archivio.unisci.mock.calls[0];
      expect(uid).toBe('u1');
      expect(campi).toEqual({
        attivo: true, giorni: [1, 3, 5], ora: '18:00',
        fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        prossimo: prossimoPromemoria({ ...lmv, attivo: true }, new Date())!.invio,
        ...foto,
        iscrizioni: { [chiaveTelefono(endpoint)]: iscrizione.toJSON() }
      });
      // Oggi alle 17:30, mezz'ora prima delle 18.
      expect(campi['prossimo']).toEqual(new Date(2026, 9, 26, 17, 30));
      expect(await s.carica()).toEqual({ attivo: true, giorni: [1, 3, 5], ora: '18:00' });
    });

    it('permesso negato: lo dice e non scrive niente', async () => {
      vi.stubGlobal('Notification', { permission: 'denied' });
      const { s, archivio } = monta({ richiesta: async () => { throw new Error('NotAllowedError'); } });
      expect(await s.attiva(lmv)).toBe('negato');
      expect(archivio.unisci).not.toHaveBeenCalled();
    });

    it('un altro errore dell\'iscrizione, o del salvataggio, e\' un errore', async () => {
      vi.stubGlobal('Notification', { permission: 'default' });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = monta({ richiesta: async () => { throw new Error('servizio push'); } });
      expect(await a.s.attiva(lmv)).toBe('errore');
      TestBed.resetTestingModule();
      const b = monta();
      b.archivio.unisci.mockRejectedValueOnce(new Error('offline'));
      expect(await b.s.attiva(lmv)).toBe('errore');
    });
  });

  it('spegnere: attivo falso, nessun prossimo, i telefoni restano', async () => {
    const { s, archivio } = monta();
    await s.spegni({ ...lmv, attivo: true });
    const campi = archivio.unisci.mock.calls[0][1];
    expect(campi).toMatchObject({ attivo: false, prossimo: null });
    expect(campi).not.toHaveProperty('iscrizioni');
  });

  it('cambiare giorni o ora ricalcola il prossimo', async () => {
    const { s, archivio } = monta();
    await s.cambia({ attivo: true, giorni: [2], ora: '07:00' });
    expect(archivio.unisci.mock.calls[0][1]['prossimo']).toEqual(new Date(2026, 9, 27, 6, 30));
  });

  describe('la fotografia della settimana', () => {
    it('si scrive a ogni lettura delle sedute, col telefono, ma solo se e\' cambiata', async () => {
      const { s, archivio, dopoOgniLettura } = monta({ documento: { ...lmv, attivo: true } });
      expect(dopoOgniLettura).toHaveBeenCalledTimes(1);
      await dopoOgniLettura.mock.calls[0][0]();
      await vi.waitFor(() => expect(archivio.aggiorna).toHaveBeenCalledTimes(1));
      expect(archivio.aggiorna).toHaveBeenCalledWith('u1', { ...foto, [`iscrizioni.${chiaveTelefono(endpoint)}`]: iscrizione.toJSON() });
      await s.sincronizza();
      expect(archivio.aggiorna).toHaveBeenCalledTimes(1);
    });

    it('con i promemoria spenti, o senza utente, non si scrive', async () => {
      const spenti = monta({ documento: lmv });
      await spenti.s.sincronizza();
      expect(spenti.archivio.aggiorna).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      const nessuno = monta({ utente: null });
      await nessuno.s.sincronizza();
      expect(nessuno.archivio.leggi).not.toHaveBeenCalled();
    });

    it('senza iscrizione sul telefono si scrive solo la fotografia', async () => {
      const { s, archivio } = monta({ documento: { ...lmv, attivo: true }, attuale: null });
      await s.sincronizza();
      expect(archivio.aggiorna).toHaveBeenCalledWith('u1', foto);
    });
  });

  describe('uscire dall\'account', () => {
    it('toglie questo telefono dai promemoria di chi esce', async () => {
      const { archivio, primaDiUscire } = monta();
      await primaDiUscire.mock.calls[0][0]();
      expect(archivio.togliTelefono).toHaveBeenCalledWith('u1', chiaveTelefono(endpoint));
    });

    it('senza iscrizione, o senza utente, non tocca niente; un errore non ferma l\'uscita', async () => {
      const senza = monta({ attuale: null });
      await senza.primaDiUscire.mock.calls[0][0]();
      expect(senza.archivio.togliTelefono).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      const rotto = monta();
      rotto.archivio.togliTelefono.mockRejectedValueOnce(new Error('non c\'e\''));
      await expect(rotto.primaDiUscire.mock.calls[0][0]()).resolves.toBeUndefined();
    });
  });

  it('la chiave del telefono e\' corta, fissa e diversa per ogni indirizzo', () => {
    const k = chiaveTelefono(endpoint);
    expect(k).toMatch(/^t[0-9a-f]{16}$/);
    expect(chiaveTelefono(endpoint)).toBe(k);
    expect(chiaveTelefono(endpoint + 'd')).not.toBe(k);
    // Fissa: se cambiasse, i telefoni gia' iscritti avrebbero due chiavi e due notifiche.
    expect(k).toBe('t051b2855fb26580d');
    expect(chiaveTelefono('https://fcm.googleapis.com/fcm/send/xyz')).toBe('t1eaad1751def3099');
  });
});
