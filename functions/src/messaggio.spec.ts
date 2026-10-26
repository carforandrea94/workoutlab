import { describe, expect, it } from 'vitest';
import { RITARDO_MASSIMO_MINUTI, carico, decidi } from './messaggio';

const ROMA = 'Europe/Rome';
const utc = (s: string) => new Date(s + 'Z');
/** Mercoledi' 28 ottobre 2026 alle 17:30 di Roma. */
const previsto = utc('2026-10-28T16:30:00');
const programma = [{ id: 'd1', label: 'Petto e tricipiti' }, { id: 'd2', label: 'Schiena' }, { id: 'd3', label: 'Gambe' }];

describe('decidi', () => {
  it('dice quale seduta tocca e porta a quella', () => {
    const d = decidi({ programma, fatti: { settimana: '2026-10-26', ids: ['d1'] } }, '18:00', ROMA, previsto, previsto);
    expect(d).toEqual({ invia: true, notifica: {
      titolo: 'Oggi alle 18:00: Schiena', testo: 'Tra mezz\'ora si comincia: tocca per aprire la scheda.', url: '/scheda/day/1'
    } });
  });

  it('i giorni fatti di una settimana passata non contano', () => {
    const d = decidi({ programma, fatti: { settimana: '2026-10-19', ids: ['d1', 'd2', 'd3'] } }, '18:00', ROMA, previsto, previsto);
    expect(d.invia && d.notifica.url).toBe('/scheda/day/0');
  });

  it('settimana completa, o seduta gia\' fatta oggi: tace', () => {
    expect(decidi({ programma, fatti: { settimana: '2026-10-26', ids: ['d1', 'd2', 'd3'] } }, '18:00', ROMA, previsto, previsto))
      .toEqual({ invia: false, motivo: 'settimana completa' });
    expect(decidi({ programma, ultimaSeduta: '2026-10-28' }, '18:00', ROMA, previsto, previsto))
      .toEqual({ invia: false, motivo: 'gia\' fatta oggi' });
    // Ieri non conta.
    expect(decidi({ programma, ultimaSeduta: '2026-10-27' }, '18:00', ROMA, previsto, previsto).invia).toBe(true);
  });

  it('senza programma, un promemoria che porta alla scheda', () => {
    expect(decidi({}, '07:00', ROMA, previsto, previsto)).toEqual({ invia: true, notifica: {
      titolo: 'Oggi alle 07:00 ti alleni', testo: 'Tra mezz\'ora si comincia: tocca per aprire la scheda.', url: '/scheda'
    } });
  });

  it('un giorno senza nome si chiama col suo numero', () => {
    const d = decidi({ programma: [{ id: 'd1', label: '  ' }] }, '18:00', ROMA, previsto, previsto);
    expect(d.invia && d.notifica.titolo).toBe('Oggi alle 18:00: Giorno 1');
  });

  it('troppo in ritardo non si manda: "tra mezz\'ora" sarebbe falso', () => {
    expect(RITARDO_MASSIMO_MINUTI).toBe(20);
    const giusto = new Date(previsto.getTime() + 20 * 60_000);
    expect(decidi({ programma }, '18:00', ROMA, previsto, giusto).invia).toBe(true);
    expect(decidi({ programma }, '18:00', ROMA, previsto, new Date(giusto.getTime() + 60_000)))
      .toEqual({ invia: false, motivo: 'in ritardo' });
  });
});

describe('carico', () => {
  it('e\' il formato che il service worker di Angular mostra, col tocco che apre la seduta', () => {
    expect(JSON.parse(carico({ titolo: 'T', testo: 'B', url: '/scheda/day/1' }))).toEqual({
      notification: {
        title: 'T', body: 'B', icon: 'icons/icon-192x192.png', tag: 'promemoria', renotify: true,
        data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/scheda/day/1' } } }
      }
    });
  });
});
