import { describe, expect, it } from 'vitest';
import { ANTICIPO_MINUTI, fusoValido, giornoNelFuso, istanteLocale, lunediNelFuso, prossimoInvio } from './orario';

const ROMA = 'Europe/Rome';
const utc = (s: string) => new Date(s + 'Z');

describe('istanteLocale', () => {
  it('le 18 di Roma sono le 16 UTC d\'estate e le 17 d\'inverno', () => {
    expect(istanteLocale(2026, 7, 15, 18, 0, ROMA).toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(istanteLocale(2026, 11, 16, 18, 0, ROMA).toISOString()).toBe('2026-11-16T17:00:00.000Z');
  });

  it('nei giorni del cambio d\'ora conta da che parte del cambio si sta', () => {
    // 25 ottobre 2026: alle 3 si torna alle 2. Le 18 sono gia' ora solare.
    expect(istanteLocale(2026, 10, 25, 18, 0, ROMA).toISOString()).toBe('2026-10-25T17:00:00.000Z');
    // 29 marzo 2026: alle 2 si va alle 3. Le 18 sono gia' ora legale.
    expect(istanteLocale(2026, 3, 29, 18, 0, ROMA).toISOString()).toBe('2026-03-29T16:00:00.000Z');
  });

  it('a ridosso del cambio d\'ora conta l\'ora che c\'era in quel momento', () => {
    // 29 marzo 2026, l'una e mezza: e' ancora ora solare (il cambio e' alle 2).
    expect(istanteLocale(2026, 3, 29, 1, 30, ROMA).toISOString()).toBe('2026-03-29T00:30:00.000Z');
    // 25 ottobre 2026, le quattro: e' gia' ora solare (il cambio e' alle 3).
    expect(istanteLocale(2026, 10, 25, 4, 0, ROMA).toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('funziona per ogni fuso, anche quelli con la mezz\'ora', () => {
    expect(istanteLocale(2026, 10, 26, 18, 0, 'America/New_York').toISOString()).toBe('2026-10-26T22:00:00.000Z');
    expect(istanteLocale(2026, 10, 26, 18, 0, 'Asia/Kolkata').toISOString()).toBe('2026-10-26T12:30:00.000Z');
  });
});

describe('il calendario nel fuso', () => {
  it('a mezzanotte e mezza di Roma e\' gia\' il giorno dopo, anche se in UTC no', () => {
    expect(giornoNelFuso(utc('2026-10-26T23:30:00'), ROMA)).toBe('2026-10-27');
    expect(giornoNelFuso(utc('2026-10-26T22:30:00'), ROMA)).toBe('2026-10-26');
  });

  it('il lunedi\' della settimana', () => {
    expect(lunediNelFuso(utc('2026-11-01T10:00:00'), ROMA)).toBe('2026-10-26');
    expect(lunediNelFuso(utc('2026-10-26T10:00:00'), ROMA)).toBe('2026-10-26');
    // Domenica sera tardi in UTC e' gia' lunedi' a Roma.
    expect(lunediNelFuso(utc('2026-11-01T23:30:00'), ROMA)).toBe('2026-11-02');
  });

  it('un fuso sconosciuto non passa', () => {
    expect(fusoValido(ROMA)).toBe(true);
    expect(fusoValido('Europa/Roma')).toBe(false);
    expect(fusoValido('')).toBe(false);
    expect(fusoValido(null)).toBe(false);
  });
});

describe('prossimoInvio', () => {
  const lmv = { giorni: [1, 3, 5], ora: '18:00', fuso: ROMA };

  it('mezz\'ora prima dell\'allenamento, nel fuso dell\'utente', () => {
    expect(ANTICIPO_MINUTI).toBe(30);
    // Lunedi' 26 ottobre, le 9 a Roma.
    const r = prossimoInvio(lmv, utc('2026-10-26T08:00:00'))!;
    expect(r.allenamento.toISOString()).toBe('2026-10-26T17:00:00.000Z');
    expect(r.invio.toISOString()).toBe('2026-10-26T16:30:00.000Z');
  });

  it('appena mandato, il prossimo e\' il giorno scelto dopo', () => {
    expect(prossimoInvio(lmv, utc('2026-10-26T16:30:00'))!.invio.toISOString()).toBe('2026-10-28T16:30:00.000Z');
    expect(prossimoInvio({ ...lmv, giorni: [1] }, utc('2026-10-26T16:30:00'))!.invio.toISOString()).toBe('2026-11-02T16:30:00.000Z');
  });

  it('attraverso il cambio d\'ora resta alle 17:30 dell\'orologio', () => {
    // Venerdi' 23 ottobre ora legale (15:30 UTC), lunedi' 26 ora solare (16:30 UTC).
    expect(prossimoInvio(lmv, utc('2026-10-22T10:00:00'))!.invio.toISOString()).toBe('2026-10-23T15:30:00.000Z');
    expect(prossimoInvio(lmv, utc('2026-10-23T15:30:00'))!.invio.toISOString()).toBe('2026-10-26T16:30:00.000Z');
  });

  it('la domenica e\' il giorno 7', () => {
    // Lunedi' 26 ottobre: la prima domenica e' il primo novembre.
    expect(prossimoInvio({ giorni: [7], ora: '10:00', fuso: ROMA }, utc('2026-10-26T08:00:00'))!.allenamento.toISOString())
      .toBe('2026-11-01T09:00:00.000Z');
  });

  it('un allenamento poco dopo mezzanotte si ricorda la sera prima', () => {
    const r = prossimoInvio({ giorni: [2], ora: '00:15', fuso: ROMA }, utc('2026-10-26T08:00:00'))!;
    expect(r.allenamento.toISOString()).toBe('2026-10-26T23:15:00.000Z');
    expect(r.invio.toISOString()).toBe('2026-10-26T22:45:00.000Z');
  });

  it('senza giorni, con un\'ora sbagliata o un fuso sconosciuto, niente', () => {
    expect(prossimoInvio({ ...lmv, giorni: [] }, utc('2026-10-26T08:00:00'))).toBeNull();
    expect(prossimoInvio({ ...lmv, ora: '18' }, utc('2026-10-26T08:00:00'))).toBeNull();
    expect(prossimoInvio({ ...lmv, fuso: 'Europa/Roma' }, utc('2026-10-26T08:00:00'))).toBeNull();
  });
});
