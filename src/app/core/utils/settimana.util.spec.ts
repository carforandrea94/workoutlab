import { describe, expect, it } from 'vitest';
import { DatiBilancio, GIORNI_MEDIA, GIORNI_PASTI, SETTIMANE_PREVISIONE, bilancio, mediaMobile, mediaSettimana, registraPasti } from './settimana.util';

/** Lunedi' 26 ottobre 2026: la settimana scorsa va dal 19 al 25. */
const oggi = '2026-10-26';
const vuoti: DatiBilancio = {
  oggi, sedute: [], previsti: 3, corse: [], obiettivoCorsa: null, pastiGiorni: null, pesate: [], obiettivo: null
};
const dati = (extra: Partial<DatiBilancio>): DatiBilancio => ({ ...vuoti, ...extra });

describe('mediaMobile', () => {
  it('ogni pesata diventa la media dei sette giorni che finiscono quel giorno', () => {
    expect(GIORNI_MEDIA).toBe(7);
    const m = mediaMobile([
      { date: '2026-10-01', value: 100 }, { date: '2026-10-03', value: 102 },
      { date: '2026-10-07', value: 104 }, { date: '2026-10-08', value: 106 }
    ]);
    expect(m.map(p => p.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-07', '2026-10-08']);
    expect(m.map(p => p.value)).toEqual([100, 101, 102, 104]);
  });

  it('una pesata sola e\' la sua media', () => {
    expect(mediaMobile([{ date: '2026-10-01', value: 80 }])).toEqual([{ date: '2026-10-01', value: 80 }]);
    expect(mediaMobile([])).toEqual([]);
  });
});

describe('mediaSettimana', () => {
  it('la media delle pesate da lunedi\' a domenica; null senza pesate', () => {
    const pesate = [{ date: '2026-10-18', value: 90 }, { date: '2026-10-19', value: 112 }, { date: '2026-10-25', value: 113 }, { date: '2026-10-26', value: 80 }];
    expect(mediaSettimana(pesate, '2026-10-19')).toBe(112.5);
    expect(mediaSettimana(pesate, '2026-10-05')).toBeNull();
  });
});

describe('registraPasti', () => {
  it('aggiorna oggi e lascia andare i giorni troppo vecchi', () => {
    expect(GIORNI_PASTI).toBe(35);
    const storia = { '2026-09-20': { fatti: 3, totali: 3 }, '2026-09-21': { fatti: 2, totali: 3 }, '2026-10-25': { fatti: 1, totali: 3 } };
    expect(registraPasti(storia, '2026-10-25', 2, 3)).toEqual({ '2026-09-21': { fatti: 2, totali: 3 }, '2026-10-25': { fatti: 2, totali: 3 } });
  });

  it('parte anche senza storia, e scarta le chiavi che non sono date', () => {
    expect(registraPasti(null, '2026-10-25', 1, 4)).toEqual({ '2026-10-25': { fatti: 1, totali: 4 } });
    expect(registraPasti({ ieri: { fatti: 1, totali: 1 } } as any, '2026-10-25', -1, 4)).toEqual({ '2026-10-25': { fatti: 0, totali: 4 } });
  });
});

describe('bilancio della settimana scorsa', () => {
  it('una settimana senza niente di registrato non ha bilancio', () => {
    expect(bilancio(vuoti)).toBeNull();
    // Quello di questa settimana non conta: e' ancora aperta.
    expect(bilancio(dati({ sedute: [{ dayId: 'd1', date: '2026-10-26' }], pesate: [{ date: '2026-10-26', value: 80 }] }))).toBeNull();
    expect(bilancio(dati({ oggi: 'lunedi' }))).toBeNull();
  });

  it('allenamenti: i giorni del programma fatti, ognuno una volta, su quelli previsti', () => {
    const b = bilancio(dati({ sedute: [
      { dayId: 'd1', date: '2026-10-19' }, { dayId: 'd1', date: '2026-10-21' }, { dayId: 'd2', date: '2026-10-25' },
      { dayId: 'd3', date: '2026-10-18' }, { dayId: 'd3', date: '2026-10-26' }
    ] }))!;
    expect(b.lunedi).toBe('2026-10-19');
    expect(b.allenamenti).toEqual({ fatti: 2, previsti: 3 });
    expect(bilancio(dati({ previsti: 0, sedute: [{ dayId: 'd1', date: '2026-10-20' }] }))!.allenamenti).toBeNull();
    // Un giorno di un programma vecchio non fa superare quelli previsti.
    expect(bilancio(dati({ previsti: 1, sedute: [{ dayId: 'd1', date: '2026-10-20' }, { dayId: 'x', date: '2026-10-21' }] }))!.allenamenti).toEqual({ fatti: 1, previsti: 1 });
  });

  it('corsa: i minuti della settimana, e l\'obiettivo se c\'e\'', () => {
    const corse = [{ date: '2026-10-20', durationMin: 40 }, { date: '2026-10-24', durationMin: 55 }, { date: '2026-10-27', durationMin: 30 }, { date: '2026-10-22', durationMin: -5 }];
    expect(bilancio(dati({ corse, obiettivoCorsa: 120 }))!.corsa).toEqual({ minuti: 95, obiettivo: 120 });
    expect(bilancio(dati({ corse, obiettivoCorsa: 0 }))!.corsa.obiettivo).toBeNull();
  });

  it('pasti: quelli segnati nei giorni della settimana, su quelli dei piani', () => {
    const pastiGiorni = { '2026-10-19': { fatti: 3, totali: 3 }, '2026-10-20': { fatti: 2, totali: 3 }, '2026-10-26': { fatti: 3, totali: 3 }, '2026-10-21': { fatti: 5, totali: 3 }, '2026-10-22': { fatti: 1, totali: 0 } };
    expect(bilancio(dati({ pastiGiorni }))!.pasti).toEqual({ fatti: 8, totali: 9 });
    expect(bilancio(dati({ pastiGiorni: { '2026-10-26': { fatti: 1, totali: 3 } }, corse: [{ date: '2026-10-20', durationMin: 30 }] }))!.pasti).toBeNull();
  });

  it('peso: la media della settimana e quella della settimana prima', () => {
    const pesate = [{ date: '2026-10-13', value: 113 }, { date: '2026-10-15', value: 112.6 }, { date: '2026-10-20', value: 112.5 }, { date: '2026-10-23', value: 112.24 }];
    expect(bilancio(dati({ pesate }))!.peso).toEqual({ media: 112.4, prima: 112.8 });
    expect(bilancio(dati({ pesate: pesate.slice(2) }))!.peso).toEqual({ media: 112.4, prima: null });
  });

  describe('la frase', () => {
    const pesate = (prima: number, dopo: number) => [{ date: '2026-10-14', value: prima }, { date: '2026-10-21', value: dopo }];
    const grasso = { tipo: 'grasso' as const, peso: 110, entro: '2027-02-01' };

    it('col traguardo e il peso nella direzione giusta: quanto manca a questo passo, e se si arriva in tempo', () => {
      expect(bilancio(dati({ pesate: pesate(112.7, 112.4), obiettivo: grasso }))!.frase)
        .toBe('Il peso medio scende di 0,3 kg a settimana: a questo passo arrivi a 110 kg in circa 8 settimane, prima del 1 feb 2027.');
      expect(bilancio(dati({ pesate: pesate(112.5, 112.4), obiettivo: grasso }))!.frase)
        .toBe('Il peso medio scende di 0,1 kg a settimana: a questo passo arrivi a 110 kg in circa 24 settimane, dopo il 1 feb 2027 che ti eri dato.');
      expect(bilancio(dati({ pesate: pesate(80, 81), obiettivo: { tipo: 'massa', peso: 81.5, entro: null } }))!.frase)
        .toBe('Il peso medio sale di 1 kg a settimana: a questo passo arrivi a 81,5 kg in circa una settimana.');
    });

    it('arrivare proprio il giorno che ci si era dati e\' arrivare in tempo', () => {
      // Otto settimane da lunedi' 26 ottobre: lunedi' 21 dicembre.
      expect(bilancio(dati({ pesate: pesate(112.7, 112.4), obiettivo: { ...grasso, entro: '2026-12-21' } }))!.frase)
        .toBe('Il peso medio scende di 0,3 kg a settimana: a questo passo arrivi a 110 kg in circa 8 settimane, prima del 21 dic.');
      expect(bilancio(dati({ pesate: pesate(112.7, 112.4), obiettivo: { ...grasso, entro: '2026-12-20' } }))!.frase)
        .toBe('Il peso medio scende di 0,3 kg a settimana: a questo passo arrivi a 110 kg in circa 8 settimane, dopo il 20 dic che ti eri dato.');
    });

    it('le settimane si contano senza gli errori della virgola mobile', () => {
      // 2,1 kg a 0,3 a settimana: 7 settimane, non 8.
      expect(bilancio(dati({ pesate: pesate(112.4, 112.1), obiettivo: { ...grasso, entro: null } }))!.frase)
        .toBe('Il peso medio scende di 0,3 kg a settimana: a questo passo arrivi a 110 kg in circa 7 settimane.');
    });

    it('oltre un anno a questo passo niente previsione: com\'e\' andata e quanto manca', () => {
      expect(SETTIMANE_PREVISIONE).toBe(52);
      // 2,4 kg a 0,1 a settimana: 24 settimane, si prevede.
      expect(bilancio(dati({ pesate: pesate(112.5, 112.4), obiettivo: grasso }))!.frase).toContain('in circa 24 settimane');
      // 5,2 kg a 0,1: 52 settimane, ancora si'. 5,3: 53, no.
      expect(bilancio(dati({ pesate: pesate(115.3, 115.2), obiettivo: grasso }))!.frase).toContain('in circa 52 settimane');
      expect(bilancio(dati({ pesate: pesate(115.4, 115.3), obiettivo: grasso }))!.frase)
        .toBe('Il peso medio è sceso di 0,1 kg: il traguardo di 110 kg è a 5,3 kg.');
    });

    it('nella direzione sbagliata, o fermo, lo dice com\'e\' con la distanza che resta', () => {
      expect(bilancio(dati({ pesate: pesate(112.4, 112.6), obiettivo: grasso }))!.frase)
        .toBe('Il peso medio è salito di 0,2 kg: il traguardo di 110 kg è a 2,6 kg.');
      expect(bilancio(dati({ pesate: pesate(112.4, 112.4), obiettivo: grasso }))!.frase)
        .toBe('Il peso medio è fermo a 112,4 kg: il traguardo di 110 kg è a 2,4 kg.');
      expect(bilancio(dati({ pesate: pesate(81, 80.5), obiettivo: { tipo: 'massa', peso: 85, entro: null } }))!.frase)
        .toBe('Il peso medio è sceso di 0,5 kg: il traguardo di 85 kg è a 4,5 kg.');
    });

    it('al traguardo lo dice', () => {
      expect(bilancio(dati({ pesate: pesate(110.4, 109.8), obiettivo: grasso }))!.frase).toBe('Il peso medio è al traguardo di 110 kg: obiettivo raggiunto.');
    });

    it('senza traguardo, o senza due settimane di pesate: la scheda completa, poi la corsa', () => {
      const tutti = [{ dayId: 'd1', date: '2026-10-19' }, { dayId: 'd2', date: '2026-10-21' }, { dayId: 'd3', date: '2026-10-23' }];
      expect(bilancio(dati({ sedute: tutti, pesate: pesate(112, 112) }))!.frase).toBe('Scheda completa: tutti gli allenamenti della settimana fatti.');
      expect(bilancio(dati({ sedute: tutti, pesate: [{ date: '2026-10-21', value: 112 }], obiettivo: grasso }))!.frase).toBe('Scheda completa: tutti gli allenamenti della settimana fatti.');
      expect(bilancio(dati({ sedute: tutti.slice(1), corse: [{ date: '2026-10-20', durationMin: 130 }], obiettivoCorsa: 120 }))!.frase).toBe('Obiettivo di corsa raggiunto: 130 minuti su 120.');
      expect(bilancio(dati({ sedute: tutti.slice(1), corse: [{ date: '2026-10-20', durationMin: 120 }], obiettivoCorsa: 120 }))!.frase).toBe('Obiettivo di corsa raggiunto: 120 minuti su 120.');
      expect(bilancio(dati({ sedute: tutti.slice(1), corse: [{ date: '2026-10-20', durationMin: 30 }], obiettivoCorsa: 120 }))!.frase).toBeNull();
    });
  });
});
