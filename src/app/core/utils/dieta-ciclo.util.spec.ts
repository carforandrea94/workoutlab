import { describe, expect, it } from 'vitest';
import { normalizzaCiclo, posizioneNelCiclo } from './dieta-ciclo.util';

/**
 * La dieta ciclica va col calendario: dal primo giorno, ogni giorno il piano
 * dopo, e dopo l'ultimo si riparte. ON/OFF non indica nessun piano.
 */
describe('il ciclo della dieta', () => {
  const ciclica = (inizio: string | null) => ({ tipo: 'ciclica' as const, inizio });

  describe('il tipo letto dal protocollo', () => {
    it('ciclica col suo primo giorno', () => {
      expect(normalizzaCiclo('ciclica', '2026-10-20')).toEqual({ tipo: 'ciclica', inizio: '2026-10-20' });
    });

    it('senza tipo, o con un tipo che non si capisce, e\' ON/OFF e il primo giorno non conta', () => {
      expect(normalizzaCiclo(undefined, '2026-10-20')).toEqual({ tipo: 'onoff', inizio: null });
      expect(normalizzaCiclo('onoff', '2026-10-20')).toEqual({ tipo: 'onoff', inizio: null });
      expect(normalizzaCiclo('Ciclica', null)).toEqual({ tipo: 'onoff', inizio: null });
    });

    it('un primo giorno che non e\' una data resta vuoto', () => {
      expect(normalizzaCiclo('ciclica', '')).toEqual({ tipo: 'ciclica', inizio: null });
      expect(normalizzaCiclo('ciclica', '20/10/2026')).toEqual({ tipo: 'ciclica', inizio: null });
      expect(normalizzaCiclo('ciclica', 20261020)).toEqual({ tipo: 'ciclica', inizio: null });
    });
  });

  describe('il piano di oggi', () => {
    it('il primo giorno tocca il primo piano, poi uno al giorno, e dopo l\'ultimo si riparte', () => {
      const giorni = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
      expect(giorni.map(g => posizioneNelCiclo(ciclica('2026-10-20'), 3, g))).toEqual([
        { stato: 'oggi', indice: 0, domani: 1 },
        { stato: 'oggi', indice: 1, domani: 2 },
        { stato: 'oggi', indice: 2, domani: 0 },
        { stato: 'oggi', indice: 0, domani: 1 },
        { stato: 'oggi', indice: 1, domani: 2 }
      ]);
    });

    it('va col calendario anche molto dopo, e il cambio d\'ora non sposta niente', () => {
      // 365 giorni dopo, con un ciclo di 4: 365 % 4 = 1.
      expect(posizioneNelCiclo(ciclica('2025-10-20'), 4, '2026-10-20')).toEqual({ stato: 'oggi', indice: 1, domani: 2 });
      // Il 25 ottobre 2026 si torna all'ora solare: dal 24 al 26 sono due giorni.
      expect(posizioneNelCiclo(ciclica('2026-10-24'), 5, '2026-10-26')).toEqual({ stato: 'oggi', indice: 2, domani: 3 });
    });

    it('con un piano solo e\' sempre lui', () => {
      expect(posizioneNelCiclo(ciclica('2026-10-20'), 1, '2026-10-26')).toEqual({ stato: 'oggi', indice: 0, domani: 0 });
    });

    it('prima del primo giorno il ciclo non e\' cominciato', () => {
      expect(posizioneNelCiclo(ciclica('2026-11-02'), 3, '2026-10-26')).toEqual({ stato: 'non-iniziato', inizio: '2026-11-02' });
    });

    it('ON/OFF, senza piani o senza primo giorno: nessun piano di oggi', () => {
      expect(posizioneNelCiclo({ tipo: 'onoff', inizio: '2026-10-20' }, 3, '2026-10-26')).toBeNull();
      expect(posizioneNelCiclo(ciclica('2026-10-20'), 0, '2026-10-26')).toBeNull();
      expect(posizioneNelCiclo(ciclica(null), 3, '2026-10-26')).toBeNull();
      expect(posizioneNelCiclo(ciclica('2026-10-20'), 3, 'oggi')).toBeNull();
    });
  });
});
