import { describe, expect, it } from 'vitest';
import { SETTIMANE_IN_VISTA, SETTIMANE_PROGRAMMA_IN_VISTA, costanza } from './costanza.util';

/** Le settimane di fila: si contano le settimane complete, non i giorni. */
describe('costanza', () => {
  // Sabato 24 ottobre 2026: la settimana in corso parte lunedi' 19.
  const oggi = '2026-10-24';
  const seduta = (dayId: string, date: string) => ({ dayId, date });
  const settimanaCompleta = (lunedi: string) => {
    const [a, m, g] = lunedi.split('-').map(Number);
    const giorno = (n: number) => new Date(Date.UTC(a, m - 1, g + n)).toISOString().slice(0, 10);
    return [seduta('day0', giorno(0)), seduta('day1', giorno(2)), seduta('day2', giorno(4))];
  };

  it('le settimane complete una dopo l\'altra, questa compresa se e\' completa', () => {
    const c = costanza([
      ...settimanaCompleta('2026-10-05'), ...settimanaCompleta('2026-10-12'), ...settimanaCompleta('2026-10-19')
    ], 3, oggi)!;
    expect(c.fila).toBe(3);
    expect(c).toMatchObject({ previsti: 3, fatti: 3, mancano: 0 });
  });

  it('la settimana in corso, finche\' e\' aperta, non spezza la fila', () => {
    const c = costanza([
      ...settimanaCompleta('2026-10-05'), ...settimanaCompleta('2026-10-12'), seduta('day0', '2026-10-20')
    ], 3, oggi)!;
    expect(c).toMatchObject({ fila: 2, fatti: 1, mancano: 2 });
  });

  it('una settimana incompleta in mezzo la spezza; quelle prima non contano piu\'', () => {
    const c = costanza([
      ...settimanaCompleta('2026-09-28'), ...settimanaCompleta('2026-10-05'),
      seduta('day0', '2026-10-13'), seduta('day1', '2026-10-15'),
      ...settimanaCompleta('2026-10-19')
    ], 3, oggi)!;
    expect(c.fila).toBe(1);
  });

  it('un giorno saltato e recuperato entro domenica tiene la settimana intera', () => {
    // Il giorno 2 fatto domenica invece che venerdi'.
    const c = costanza([
      seduta('day0', '2026-10-12'), seduta('day1', '2026-10-14'), seduta('day2', '2026-10-18')
    ], 3, oggi)!;
    expect(c.fila).toBe(1);
    expect(c.settimane.at(-2)).toMatchObject({ lunedi: '2026-10-12', fatti: 3, completa: true, inCorso: false });
  });

  it('lo stesso giorno due volte conta una: la scheda e\' completa quando ci sono tutti', () => {
    const c = costanza([seduta('day0', '2026-10-19'), seduta('day0', '2026-10-21'), seduta('day1', '2026-10-22')], 3, oggi)!;
    expect(c).toMatchObject({ fatti: 2, mancano: 1, fila: 0 });
  });

  it('le ultime settimane in vista, dalla piu\' vecchia: l\'ultima e\' quella in corso', () => {
    const c = costanza([seduta('day0', '2026-06-01'), ...settimanaCompleta('2026-10-12')], 3, oggi)!;
    expect(SETTIMANE_IN_VISTA).toBe(8);
    expect(c.settimane.map(s => s.lunedi)).toEqual([
      '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'
    ]);
    expect(c.settimane.map(s => s.completa)).toEqual([false, false, false, false, false, false, true, false]);
    expect(c.settimane.map(s => s.inCorso)).toEqual([false, false, false, false, false, false, false, true]);
    expect(costanza([seduta('day0', '2026-06-01')], 3, oggi, 3)!.settimane).toHaveLength(3);
  });

  it('le settimane prima della prima seduta non sono settimane mancate', () => {
    const c = costanza([seduta('day0', '2026-10-07'), ...settimanaCompleta('2026-10-12')], 3, oggi)!;
    expect(c.settimane.map(s => s.lunedi)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
    // Chi non ha ancora sedute ha solo la settimana in corso.
    expect(costanza([], 3, oggi)!.settimane.map(s => s.lunedi)).toEqual(['2026-10-19']);
  });

  it('i giorni che restano fino a domenica, oggi compreso', () => {
    expect(costanza([], 3, '2026-10-19')!.giorniRimasti).toBe(7);
    expect(costanza([], 3, '2026-10-21')!.giorniRimasti).toBe(5);
    expect(costanza([], 3, '2026-10-24')!.giorniRimasti).toBe(2);
    expect(costanza([], 3, '2026-10-25')!.giorniRimasti).toBe(1);
  });

  it('la domenica appartiene alla settimana che finisce, non a quella dopo', () => {
    const c = costanza([...settimanaCompleta('2026-10-19')], 3, '2026-10-25')!;
    expect(c).toMatchObject({ fila: 1, fatti: 3 });
  });

  it('chi comincia ha zero settimane e tutto da fare', () => {
    expect(costanza([], 4, oggi)).toMatchObject({ fila: 0, fatti: 0, mancano: 4 });
  });

  it('sedute senza giorno o con una data che non si legge non contano', () => {
    const c = costanza([seduta('', '2026-10-20'), seduta('day0', ''), seduta('day1', '20/10/2026'), seduta('day2', '2026-10-21')], 3, oggi)!;
    expect(c.fatti).toBe(1);
  });

  it('senza giorni nel programma, o con una data di oggi illeggibile, non c\'e\' niente da completare', () => {
    expect(costanza(settimanaCompleta('2026-10-19'), 0, oggi)).toBeNull();
    expect(costanza(settimanaCompleta('2026-10-19'), NaN, oggi)).toBeNull();
    expect(costanza(settimanaCompleta('2026-10-19'), 3, 'oggi')).toBeNull();
  });

  it('piu\' giorni fatti di quelli previsti (il programma e\' cambiato) non fanno mancare niente in negativo', () => {
    const c = costanza([seduta('day0', '2026-10-19'), seduta('day1', '2026-10-20'), seduta('vecchio', '2026-10-21')], 2, oggi)!;
    expect(c).toMatchObject({ fatti: 3, mancano: 0 });
  });
});

/**
 * La costanza dentro il programma attuale: le sedute dicono solo il giorno e un
 * programma nuovo riparte dagli stessi giorni, quindi si conta dal suo via.
 */
describe('costanza nel programma', () => {
  const seduta = (dayId: string, date: string) => ({ dayId, date });
  const completa = (lunedi: string) => {
    const [a, m, g] = lunedi.split('-').map(Number);
    const giorno = (n: number) => new Date(Date.UTC(a, m - 1, g + n)).toISOString().slice(0, 10);
    return [seduta('d1', giorno(0)), seduta('d2', giorno(2)), seduta('d3', giorno(4))];
  };
  // Mercoledi' 28 ottobre 2026; il programma parte lunedi' 26 per 4 settimane.
  const oggi = '2026-10-28';
  const programma = { inizio: '2026-10-26', settimane: 4 };

  it('una casella per settimana del programma, anche quelle da venire', () => {
    const c = costanza([], 3, oggi, SETTIMANE_PROGRAMMA_IN_VISTA, programma)!;
    expect(c.settimane.map(s => s.lunedi)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(c.settimane.map(s => s.inCorso)).toEqual([true, false, false, false]);
    expect(c.settimane.map(s => s.futura)).toEqual([false, true, true, true]);
  });

  it('le sedute di prima del via, con gli stessi giorni, non contano: ne\' nelle caselle ne\' nella fila', () => {
    const c = costanza([...completa('2026-10-12'), ...completa('2026-10-19'), seduta('d1', '2026-10-26')], 3, oggi, SETTIMANE_PROGRAMMA_IN_VISTA, programma)!;
    expect(c.fila).toBe(0);
    expect(c.settimane[0]).toMatchObject({ lunedi: '2026-10-26', fatti: 1, completa: false });
    expect(c.fatti).toBe(1);
    // Senza il programma le settimane vecchie farebbero una fila.
    expect(costanza([...completa('2026-10-12'), ...completa('2026-10-19'), seduta('d1', '2026-10-26')], 3, oggi)!.fila).toBe(2);
  });

  it('conta dal lunedi\' della settimana d\'inizio: iniziare di mercoledi\' non perde il lunedi\'', () => {
    const c = costanza([seduta('d1', '2026-10-26'), seduta('d2', '2026-10-25')], 3, oggi, SETTIMANE_PROGRAMMA_IN_VISTA, { inizio: '2026-10-28', settimane: 4 })!;
    expect(c.settimane[0].lunedi).toBe('2026-10-26');
    expect(c.fatti).toBe(1);
  });

  it('la fila si conta nel programma: le settimane complete una dopo l\'altra', () => {
    const c = costanza([...completa('2026-10-26'), ...completa('2026-11-02')], 3, '2026-11-05', SETTIMANE_PROGRAMMA_IN_VISTA, programma)!;
    expect(c.fila).toBe(2);
    expect(c.settimane.map(s => s.completa)).toEqual([true, true, false, false]);
  });

  it('prima del via sono tutte da venire, dopo la fine sono tutte passate', () => {
    const prima = costanza([], 3, '2026-10-20', SETTIMANE_PROGRAMMA_IN_VISTA, programma)!;
    expect(prima.settimane.map(s => s.futura)).toEqual([true, true, true, true]);
    expect(prima.settimane.some(s => s.inCorso)).toBe(false);
    const dopo = costanza([], 3, '2026-12-14', SETTIMANE_PROGRAMMA_IN_VISTA, programma)!;
    expect(dopo.settimane.map(s => s.futura)).toEqual([false, false, false, false]);
    expect(dopo.settimane.some(s => s.inCorso)).toBe(false);
  });

  it('con piu\' settimane delle caselle in vista, la finestra segue questa settimana con due davanti', () => {
    const lunghi = { inizio: '2026-10-26', settimane: 20 };
    const inizio = costanza([], 3, '2026-10-28', 6, lunghi)!;
    expect(inizio.settimane).toHaveLength(6);
    expect(inizio.settimane[0].lunedi).toBe('2026-10-26');
    // Settimana 10 (lunedi' 28 dicembre): la finestra parte tre settimane prima.
    const meta = costanza([], 3, '2026-12-30', 6, lunghi)!;
    expect(meta.settimane.map(s => s.lunedi)).toEqual(['2026-12-07', '2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11']);
    expect(meta.settimane[3].inCorso).toBe(true);
    // Alla fine non va oltre l'ultima settimana del programma.
    const fine = costanza([], 3, '2027-03-08', 6, lunghi)!;
    expect(fine.settimane).toHaveLength(6);
    expect(fine.settimane.at(-1)!.lunedi).toBe('2027-03-08');
    expect(fine.settimane.at(-1)!.inCorso).toBe(true);
    // Prima del via la finestra e' all'inizio, dopo la fine e' alla fine.
    expect(costanza([], 3, '2026-10-01', 6, lunghi)!.settimane[0].lunedi).toBe('2026-10-26');
    expect(costanza([], 3, '2028-01-01', 6, lunghi)!.settimane.at(-1)!.lunedi).toBe('2027-03-08');
  });

  it('un inizio non valido o un programma senza settimane: come senza programma', () => {
    const sedute = [seduta('d1', '2026-10-20')];
    const senza = costanza(sedute, 3, oggi)!;
    expect(costanza(sedute, 3, oggi, SETTIMANE_IN_VISTA, { inizio: 'boh', settimane: 4 })).toEqual(senza);
    expect(costanza(sedute, 3, oggi, SETTIMANE_IN_VISTA, { inizio: '2026-10-26', settimane: 0 })).toEqual(senza);
  });
});
