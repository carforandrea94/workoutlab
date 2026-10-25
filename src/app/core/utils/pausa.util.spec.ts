import { describe, expect, it } from 'vitest';
import {
  GIORNI_PAUSA, GIORNI_PAUSA_LUNGA, MASSIMO_SCONTO, SCONTO_PAUSA, SCONTO_PAUSA_LUNGA, scontoPausa
} from './pausa.util';

/** Si riparte dopo una pausa: i pesi suggeriti scendono un poco. */
describe('scontoPausa', () => {
  it('da una settimana il 5%, da due il 10%', () => {
    expect([GIORNI_PAUSA, GIORNI_PAUSA_LUNGA, SCONTO_PAUSA, SCONTO_PAUSA_LUNGA, MASSIMO_SCONTO]).toEqual([7, 14, 5, 10, 15]);
    expect(scontoPausa('2026-10-18', '2026-10-24')).toBe(0);
    expect(scontoPausa('2026-10-17', '2026-10-24')).toBe(5);
    expect(scontoPausa('2026-10-11', '2026-10-24')).toBe(5);
    expect(scontoPausa('2026-10-10', '2026-10-24')).toBe(10);
    expect(scontoPausa('2026-06-01', '2026-10-24')).toBe(10);
  });

  it('conta i giorni del calendario, anche a cavallo di mese, anno e ora legale', () => {
    expect(scontoPausa('2026-09-28', '2026-10-05')).toBe(5);
    expect(scontoPausa('2025-12-25', '2026-01-01')).toBe(5);
    expect(scontoPausa('2026-03-23', '2026-03-29')).toBe(0);
    expect(scontoPausa('2026-03-22', '2026-03-29')).toBe(5);
  });

  it('chi comincia non riparte: senza seduta, o con una data che non si legge, niente', () => {
    for (const ultima of [null, undefined, '', '24/10/2026', '2026-10']) {
      expect(scontoPausa(ultima, '2026-10-24')).toBe(0);
    }
    expect(scontoPausa('2026-10-01', 'oggi')).toBe(0);
  });

  it('una seduta "nel futuro" (orologio indietro) non e\' una pausa', () => {
    expect(scontoPausa('2026-11-30', '2026-10-24')).toBe(0);
  });
});
