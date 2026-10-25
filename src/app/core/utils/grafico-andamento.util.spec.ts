import { describe, expect, it } from 'vitest';
import {
  dataBreve, dataLunga, disegnaAndamento, giornoDi, numeroIt, puntoPiuVicino, taccheDate, taccheValori, uguale, variazioneIt
} from './grafico-andamento.util';

/** Il peso dello screenshot: scende fino al 7 settembre e poi risale. */
const PESI: [string, number][] = [
  ['2026-07-14', 110.9], ['2026-07-25', 109.6], ['2026-08-05', 109.2], ['2026-08-16', 109.0], ['2026-08-27', 108.4],
  ['2026-09-07', 107.6], ['2026-09-18', 110.1], ['2026-09-29', 110.9], ['2026-10-10', 111.9], ['2026-10-21', 113.1]
];
const punti = (righe: [string, number][] = PESI) => righe.map(([date, value]) => ({ date, value }));

describe('grafico di Andamento — numeri e date', () => {
  it('i numeri hanno la virgola e al massimo un decimale; gli interi restano interi', () => {
    expect(numeroIt(110.9)).toBe('110,9');
    expect(numeroIt(81)).toBe('81');
    expect(numeroIt(21.25)).toBe('21,3');
    expect(numeroIt(-0.04)).toBe('0');
  });

  it('la variazione ha il segno, e zero non ne ha', () => {
    expect(variazioneIt(2.2)).toBe('+2,2');
    expect(variazioneIt(-0.4)).toBe('-0,4');
    expect(variazioneIt(0.02)).toBe('0');
  });

  it('una variazione che arrotondata fa zero e\' "uguale"', () => {
    expect(uguale(0.04)).toBe(true);
    expect(uguale(-0.04)).toBe(true);
    expect(uguale(0.06)).toBe(false);
  });

  it('i giorni sono interi anche attraverso il cambio dell\'ora', () => {
    expect(giornoDi('2026-03-29') - giornoDi('2026-03-28')).toBe(1);
    expect(giornoDi('2026-10-25') - giornoDi('2026-10-24')).toBe(1);
  });

  it('le date si scrivono in italiano', () => {
    expect(dataBreve('2026-07-14')).toBe('14 lug');
    expect(dataBreve('2025-12-03', true)).toBe('3 dic 2025');
    expect(dataLunga('2026-10-21')).toBe('21 ottobre 2026');
  });
});

describe('grafico di Andamento — l\'asse dei valori', () => {
  it('va per numeri tondi che contengono tutti i dati, non per minimo, meta\' e massimo', () => {
    // Prima: 107,6 / 110,3 / 113,1.
    expect(taccheValori(107.6, 113.1)).toEqual([106, 108, 110, 112, 114]);
    expect(taccheValori(21.2, 23)).toEqual([21, 22, 23]);
  });

  it('una misura sempre uguale ha comunque una scala intorno al suo valore', () => {
    const t = taccheValori(67.5, 67.5);
    expect(t[0]).toBeLessThan(67.5);
    expect(t[t.length - 1]).toBeGreaterThan(67.5);
  });

  it('su un intervallo stretto il passo resta da un decimale (mai 0,25)', () => {
    const t = taccheValori(16, 16.7);
    expect(t).toEqual([16, 16.5, 17]);
    for (const v of t) expect(numeroIt(v)).toBe(String(v).replace('.', ','));
  });
});

describe('grafico di Andamento — le date sotto', () => {
  it('su tre mesi segna l\'inizio di ogni mese', () => {
    expect(taccheDate('2026-07-14', '2026-10-21').map(t => t.testo)).toEqual(['ago', 'set', 'ott']);
  });

  it('su poche settimane il primo e l\'ultimo giorno', () => {
    expect(taccheDate('2026-10-01', '2026-10-21').map(t => t.testo)).toEqual(['1 ott', '21 ott']);
  });

  it('a cavallo dell\'anno, gennaio diventa l\'anno', () => {
    expect(taccheDate('2025-11-10', '2026-03-02').map(t => t.testo)).toEqual(['dic', '2026', 'feb', 'mar']);
  });

  it('su anni di misure non scrive piu\' di sei date', () => {
    const t = taccheDate('2020-02-10', '2026-10-21');
    expect(t.length).toBeGreaterThan(1);
    expect(t.length).toBeLessThanOrEqual(6);
  });
});

describe('grafico di Andamento — il disegno', () => {
  const d = disegnaAndamento(punti(), 340, 200);

  it('i punti stanno in proporzione al tempo, non uno ogni tanto', () => {
    const p = punti([['2026-10-01', 80], ['2026-10-04', 81], ['2026-10-25', 82]]);
    const x = disegnaAndamento(p, 340, 200).punti.map(q => q.x);
    // 3 giorni contro 21: il secondo intervallo e' sette volte il primo.
    expect((x[2] - x[1]) / (x[1] - x[0])).toBeCloseTo(7, 5);
  });

  it('piu\' alto il valore, piu\' in alto il punto; tutto dentro il riquadro', () => {
    const minimo = d.punti[5];
    const ultimo = d.punti[9];
    expect(ultimo.y).toBeLessThan(minimo.y);
    for (const p of d.punti) {
      expect(p.x).toBeGreaterThanOrEqual(d.piano.x0);
      expect(p.x).toBeLessThanOrEqual(d.piano.x1);
      expect(p.y).toBeGreaterThanOrEqual(d.piano.y0);
      expect(p.y).toBeLessThanOrEqual(d.piano.y1);
    }
    expect(d.punti[0].x).toBe(d.piano.x0);
    expect(d.punti[9].x).toBe(d.piano.x1);
  });

  it('le righe della griglia vanno dal basso (106) all\'alto (114), con le scritte a destra', () => {
    expect(d.valori.map(v => v.testo)).toEqual(['106', '108', '110', '112', '114']);
    expect(d.valori[0].y).toBe(d.piano.y1);
    expect(d.valori[4].y).toBe(d.piano.y0);
    expect(d.piano.x1).toBeLessThan(340);
  });

  it('la sfumatura chiude la linea sulla base', () => {
    expect(d.linea.startsWith('M')).toBe(true);
    expect(d.area.startsWith(d.linea)).toBe(true);
    expect(d.area.endsWith('Z')).toBe(true);
    expect(d.area).toContain(`${d.piano.y1.toFixed(1)}`);
  });

  it('il disegno e\' grande quanto la card: niente da stirare', () => {
    const largo = disegnaAndamento(punti(), 600, 200);
    expect(largo.larghezza).toBe(600);
    expect(largo.piano.x1).toBeGreaterThan(d.piano.x1);
  });

  it('le date vicino ai bordi si appoggiano dentro', () => {
    const corti = disegnaAndamento(punti([['2026-10-01', 80], ['2026-10-21', 81]]), 340, 200).date;
    expect(corti.map(t => t.ancora)).toEqual(['start', 'end']);
    expect(d.date.every(t => t.ancora === 'middle')).toBe(true);
  });

  it('pochi punti hanno ciascuno il suo pallino; tanti in poco spazio no', () => {
    expect(d.conPallini).toBe(true);
    const anno = Array.from({ length: 60 }, (_, i) => ({ date: `2026-${String(1 + Math.floor(i / 6)).padStart(2, '0')}-${String(1 + (i % 6) * 4).padStart(2, '0')}`, value: 80 + (i % 5) }));
    expect(disegnaAndamento(anno, 340, 200).conPallini).toBe(false);
  });

  it('senza punti non disegna niente', () => {
    const vuoto = disegnaAndamento([], 340, 200);
    expect(vuoto.punti).toEqual([]);
    expect(vuoto.linea).toBe('');
  });

  it('il dito sceglie il punto piu\' vicino in orizzontale', () => {
    const x = d.punti.map(p => p.x);
    expect(puntoPiuVicino(d.punti, x[5] + 2)).toBe(5);
    expect(puntoPiuVicino(d.punti, -50)).toBe(0);
    expect(puntoPiuVicino(d.punti, 9999)).toBe(9);
    expect(puntoPiuVicino([], 10)).toBe(-1);
  });
});

describe('grafico di Andamento — il traguardo', () => {
  const punti = [
    { date: '2026-07-14', value: 110.9 }, { date: '2026-08-05', value: 109.2 }, { date: '2026-10-21', value: 113.1 }
  ];

  it('senza traguardo non c\'e\' linea', () => {
    expect(disegnaAndamento(punti, 320, 200).traguardo).toBeNull();
    expect(disegnaAndamento(punti, 320, 200, NaN).traguardo).toBeNull();
    expect(disegnaAndamento([], 320, 200, 100).traguardo).toBeNull();
  });

  it('la scala contiene il traguardo: la distanza si vede per quella che e\'', () => {
    const senza = disegnaAndamento(punti, 320, 200);
    const con = disegnaAndamento(punti, 320, 200, 100);
    expect(Number(senza.valori[0].testo.replace(',', '.'))).toBeGreaterThan(100);
    expect(Number(con.valori[0].testo.replace(',', '.'))).toBeLessThanOrEqual(100);
    // La linea sta sotto tutti i punti, alla quota del 100.
    expect(con.traguardo!.y).toBeGreaterThan(Math.max(...con.punti.map(p => p.y)));
    expect(con.traguardo!.y).toBeLessThanOrEqual(con.piano.y1);
    // La scritta sopra la linea.
    expect(con.traguardo!.scrittaY).toBe(con.traguardo!.y - 5);
  });

  it('un traguardo in cima alla scala ha la scritta sotto la linea, dentro il riquadro', () => {
    const d = disegnaAndamento(punti, 320, 200, 120);
    expect(d.traguardo!.y).toBe(d.piano.y0);
    expect(d.traguardo!.scrittaY).toBe(d.piano.y0 + 13);
  });
});

describe('grafico di Andamento — le pesate sotto la media', () => {
  const pesate = [
    { date: '2026-10-01', value: 80 }, { date: '2026-10-03', value: 84 }, { date: '2026-10-05', value: 79 }
  ];
  const media = [
    { date: '2026-10-01', value: 80 }, { date: '2026-10-03', value: 82 }, { date: '2026-10-05', value: 81 }
  ];

  it('senza pesate non ce ne sono, e i pallini restano quelli della linea', () => {
    const d = disegnaAndamento(media, 320, 200);
    expect(d.pesate).toEqual([]);
    expect(d.conPallini).toBe(true);
    expect(disegnaAndamento([], 320, 200, null, pesate).pesate).toEqual([]);
  });

  it('con le pesate: un punto per pesata, alla sua data e al suo valore; la linea senza pallini', () => {
    const d = disegnaAndamento(media, 320, 200, null, pesate);
    expect(d.conPallini).toBe(false);
    expect(d.pesate.map(p => p.date)).toEqual(pesate.map(p => p.date));
    expect(d.pesate.map(p => p.x)).toEqual(d.punti.map(p => p.x));
    // Il 3 ottobre la pesata (84) sta sopra la media (82); il 5 (79) sotto la media (81).
    expect(d.pesate[1].y).toBeLessThan(d.punti[1].y);
    expect(d.pesate[2].y).toBeGreaterThan(d.punti[2].y);
  });

  it('la scala contiene anche le pesate: la piu\' alta e la piu\' bassa stanno nel riquadro', () => {
    const senza = disegnaAndamento(media, 320, 200);
    const con = disegnaAndamento(media, 320, 200, null, pesate);
    expect(Number(senza.valori[senza.valori.length - 1].testo.replace(',', '.'))).toBeLessThan(84);
    expect(Number(con.valori[con.valori.length - 1].testo.replace(',', '.'))).toBeGreaterThanOrEqual(84);
    expect(Number(con.valori[0].testo.replace(',', '.'))).toBeLessThanOrEqual(79);
    for (const p of con.pesate) {
      expect(p.y).toBeGreaterThanOrEqual(con.piano.y0);
      expect(p.y).toBeLessThanOrEqual(con.piano.y1);
    }
  });

  it('le date vanno dalla prima all\'ultima di tutte, linea e pesate', () => {
    const d = disegnaAndamento(media.slice(1), 320, 200, null, pesate);
    expect(d.date.map(t => t.testo)).toEqual(['1 ott', '5 ott']);
    expect(d.pesate[0].x).toBe(d.piano.x0);
    expect(d.punti[d.punti.length - 1].x).toBe(d.piano.x1);
  });
});
