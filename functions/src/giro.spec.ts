import { describe, expect, it, vi } from 'vitest';
import { DatiPromemoria, EsitoInvio, Iscrizione, gestisci } from './giro';

const utc = (s: string) => new Date(s + 'Z');
/** Lunedi' 26 ottobre 2026, 17:30 a Roma. */
const adesso = utc('2026-10-26T16:30:00');
const tel = (n: number): Iscrizione => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });
const base = (extra: Partial<DatiPromemoria> = {}): DatiPromemoria => ({
  attivo: true, giorni: [1, 3, 5], ora: '18:00', fuso: 'Europe/Rome', prossimo: adesso,
  iscrizioni: { t1: tel(1), t2: tel(2) }, programma: [{ id: 'd1', label: 'Petto' }], ...extra
});

describe('gestisci', () => {
  it('manda a ogni telefono il messaggio della seduta, e fissa il prossimo', async () => {
    const invia = vi.fn(async (): Promise<EsitoInvio> => 'ok');
    const r = await gestisci(base(), adesso, invia);
    expect(invia).toHaveBeenCalledTimes(2);
    expect(invia.mock.calls.map(c => c[0].endpoint)).toEqual(['https://push.example/1', 'https://push.example/2']);
    expect(JSON.parse(invia.mock.calls[0][1]).notification.title).toBe('Oggi alle 18:00: Petto');
    expect(r).toEqual({ prossimo: utc('2026-10-28T16:30:00'), esito: 'mandato a 2 su 2', scadute: [] });
  });

  it('un telefono che non c\'e\' piu\' si toglie; uno che sbaglia resta, e non ferma gli altri', async () => {
    const esiti: Record<string, EsitoInvio | 'lancia'> = { 'https://push.example/1': 'scaduta', 'https://push.example/2': 'lancia', 'https://push.example/3': 'ok' };
    const invia = async (s: Iscrizione): Promise<EsitoInvio> => {
      const e = esiti[s.endpoint];
      if (e === 'lancia') throw new Error('rete');
      return e;
    };
    const r = await gestisci(base({ iscrizioni: { t1: tel(1), t2: tel(2), t3: tel(3) } }), adesso, invia);
    expect(r.scadute).toEqual(['t1']);
    expect(r.esito).toBe('mandato a 1 su 3');
  });

  it('quando decide di tacere non manda, ma fissa comunque il prossimo', async () => {
    const invia = vi.fn(async (): Promise<EsitoInvio> => 'ok');
    const r = await gestisci(base({ ultimaSeduta: '2026-10-26' }), adesso, invia);
    expect(invia).not.toHaveBeenCalled();
    expect(r).toEqual({ prossimo: utc('2026-10-28T16:30:00'), esito: 'gia\' fatta oggi', scadute: [] });
  });

  it('senza telefoni iscritti, o con iscrizioni rotte, non manda niente', async () => {
    const invia = vi.fn(async (): Promise<EsitoInvio> => 'ok');
    expect((await gestisci(base({ iscrizioni: {} }), adesso, invia)).esito).toBe('nessun telefono');
    expect((await gestisci(base({ iscrizioni: null }), adesso, invia)).esito).toBe('nessun telefono');
    expect((await gestisci(base({ iscrizioni: { a: { endpoint: '' }, b: null as any } }), adesso, invia)).esito).toBe('nessun telefono');
    expect(invia).not.toHaveBeenCalled();
  });

  it('un\'ora o un fuso che non si leggono: niente invio e niente prossimo', async () => {
    const invia = vi.fn(async (): Promise<EsitoInvio> => 'ok');
    for (const rotto of [{ ora: '25:00' }, { ora: 18 }, { fuso: 'Europa/Roma' }, { fuso: undefined }]) {
      expect(await gestisci(base(rotto as Partial<DatiPromemoria>), adesso, invia)).toEqual({ prossimo: null, esito: 'dati non validi', scadute: [] });
    }
    expect(invia).not.toHaveBeenCalled();
  });

  it('i giorni sbagliati si scartano: restano quelli veri', async () => {
    const r = await gestisci(base({ giorni: [0, 3, 9, 'lun'] }), adesso, async () => 'ok');
    expect(r.prossimo).toEqual(utc('2026-10-28T16:30:00'));
    expect((await gestisci(base({ giorni: 'lun' }), adesso, async () => 'ok')).prossimo).toBeNull();
  });

  it('un promemoria arrivato troppo tardi non si manda, ma si fissa il prossimo', async () => {
    const invia = vi.fn(async (): Promise<EsitoInvio> => 'ok');
    const r = await gestisci(base({ prossimo: new Date(adesso.getTime() - 30 * 60_000) }), adesso, invia);
    expect(invia).not.toHaveBeenCalled();
    expect(r).toEqual({ prossimo: utc('2026-10-28T16:30:00'), esito: 'in ritardo', scadute: [] });
  });

  it('senza la data prevista si conta da adesso: in tempo', async () => {
    expect((await gestisci(base({ prossimo: null }), adesso, async () => 'ok')).esito).toBe('mandato a 2 su 2');
  });
});
