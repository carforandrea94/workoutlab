import { describe, expect, it } from 'vitest';
import { BlockRow, SerieRow } from './extra-sets.util';
import { massimaleDiOggi, percentualeRm, pesoDellaSerie, rigaInFuoco, serieFatteOggi } from './percentuale-rm.util';

const riga = (o: Partial<SerieRow> = {}): SerieRow => ({
  reps: '', load: '', done: false, ripPlaceholder: '', loadPlaceholder: '', extra: false, ...o
});
const blocco = (o: Partial<BlockRow> = {}): BlockRow => ({
  reps: '', load: '', ripPlaceholder: '', loadPlaceholder: '', done: false, ...o
});
/** Una serie fatta: peso e ripetizioni scritti, come dopo la spunta. */
const fatta = (load: string, reps: string) => riga({ load, reps, done: true });

describe('serieFatteOggi', () => {
  it('prende solo le serie fatte, con il peso e le ripetizioni scritti', () => {
    const rows = [fatta('114,7', '5'), riga({ load: '114,7', reps: '5' }), riga({ loadPlaceholder: '114,7', ripPlaceholder: '5' })];
    expect(serieFatteOggi(rows)).toEqual([{ load: 114.7, reps: 5 }]);
  });

  it('con un campo vuoto ripiega sul suggerimento, come la riga chiusa', () => {
    expect(serieFatteOggi([riga({ done: true, loadPlaceholder: '80', ripPlaceholder: '8' })])).toEqual([{ load: 80, reps: 8 }]);
  });

  it('scarta le serie senza un numero vero: un riassunto di cluster o un peso scritto a parole non e\' una misura', () => {
    const rows = [fatta('62,5-55', '5'), fatta('80', '8+8'), fatta('otto', '5'), fatta('80', '0'), fatta('', '5')];
    expect(serieFatteOggi(rows)).toEqual([]);
  });

  it('su un cluster conta il primo blocco fatto della serie, non i seguenti', () => {
    const r = riga({ done: true, blocks: [blocco({ load: '60', reps: '8', done: true }), blocco({ load: '55', reps: '6', done: true })] });
    expect(serieFatteOggi([r])).toEqual([{ load: 60, reps: 8 }]);
  });

  it('su un cluster un blocco non fatto non conta, e se nessuno e\' fatto la serie non c\'e\'', () => {
    const r = riga({ blocks: [blocco({ load: '60', reps: '8' }), blocco({ load: '60', reps: '8' })] });
    expect(serieFatteOggi([r])).toEqual([]);
  });
});

describe('massimaleDiOggi', () => {
  it('senza ultima volta e senza serie fatte non c\'e\' niente da dire', () => {
    expect(massimaleDiOggi(null, [riga()])).toBeNull();
    expect(massimaleDiOggi(undefined, [])).toBeNull();
    expect(massimaleDiOggi(0, [])).toBeNull();
  });

  it('prima di fare niente vale quello dell\'ultima volta', () => {
    expect(massimaleDiOggi(126, [riga(), riga()])).toEqual({ value: 126, daOggi: null });
  });

  it('una serie che lo supera lo alza, e dice da quale serie viene', () => {
    // 114,7 x 5: 114,7 * 36 / 32 = 129,04 -> 129
    expect(massimaleDiOggi(126, [fatta('114,7', '5')])).toEqual({ value: 129, daOggi: { load: 114.7, reps: 5 } });
  });

  it('una serie piu\' leggera non lo abbassa mai', () => {
    // 100 x 5 = 112,5: sotto i 126 dell'ultima volta
    expect(massimaleDiOggi(126, [fatta('100', '5')])).toEqual({ value: 126, daOggi: null });
  });

  it('a parita\' resta quello dell\'ultima volta: non c\'e\' niente di nuovo da raccontare', () => {
    // 112,2 x 5 = 126,23 -> 126, come prima
    expect(massimaleDiOggi(126, [fatta('112,2', '5')])).toEqual({ value: 126, daOggi: null });
  });

  it('conta la serie migliore, non l\'ultima ne\' la piu\' pesante', () => {
    // 90 x 10 = 120; 100 x 3 = 105,9; 110 x 5 = 123,75 -> 124 (mezzo chilo)
    const m = massimaleDiOggi(100, [fatta('90', '10'), fatta('100', '3'), fatta('110', '5')])!;
    expect(m.value).toBe(124);
    expect(m.daOggi).toEqual({ load: 110, reps: 5 });
  });

  it('senza ultima volta il primo massimale nasce dalla prima serie fatta', () => {
    expect(massimaleDiOggi(null, [fatta('80', '5')])).toEqual({ value: 90, daOggi: { load: 80, reps: 5 } });
  });

  it('una serie oltre le ripetizioni attendibili non stima niente', () => {
    expect(massimaleDiOggi(null, [fatta('40', '20')])).toBeNull();
    expect(massimaleDiOggi(126, [fatta('40', '20')])).toEqual({ value: 126, daOggi: null });
  });

  it('una serie segnata come non fatta non entra', () => {
    expect(massimaleDiOggi(126, [riga({ load: '130', reps: '5' })])).toEqual({ value: 126, daOggi: null });
  });
});

describe('percentualeRm', () => {
  it('il peso diviso il massimale, all\'unita\'', () => {
    expect(percentualeRm(114.7, 126)).toBe(91);
    expect(percentualeRm(112.2, 126)).toBe(89);
    expect(percentualeRm(107, 126)).toBe(85);
    expect(percentualeRm(126, 126)).toBe(100);
  });

  it('sopra il massimale supera il cento: lo dice com\'e\'', () => {
    expect(percentualeRm(130, 126)).toBe(103);
  });

  it('senza un peso vero o senza massimale non c\'e\'', () => {
    expect(percentualeRm(null, 126)).toBeNull();
    expect(percentualeRm(100, null)).toBeNull();
    expect(percentualeRm(100, undefined)).toBeNull();
    expect(percentualeRm(100, 0)).toBeNull();
  });
});

describe('pesoDellaSerie', () => {
  it('quello scritto, e se manca quello suggerito', () => {
    expect(pesoDellaSerie(riga({ load: '112,2', loadPlaceholder: '110' }))).toBe(112.2);
    expect(pesoDellaSerie(riga({ loadPlaceholder: '114,7' }))).toBe(114.7);
  });

  it('senza peso, o con un riassunto al posto del peso, non c\'e\'', () => {
    expect(pesoDellaSerie(riga())).toBeNull();
    expect(pesoDellaSerie(riga({ load: '62,5-55' }))).toBeNull();
  });

  it('su un cluster e\' il peso del primo blocco, non il riassunto della serie', () => {
    const r = riga({ load: '62,5-55', blocks: [blocco({ loadPlaceholder: '62,5' }), blocco({ loadPlaceholder: '55' })] });
    expect(pesoDellaSerie(r)).toBe(62.5);
  });
});

describe('rigaInFuoco', () => {
  const tre = [fatta('100', '5'), riga(), riga()];

  it('la serie aperta, se ce n\'e\' una', () => {
    expect(rigaInFuoco(tre, 2)).toBe(2);
    expect(rigaInFuoco(tre, 0)).toBe(0);
  });

  it('nessuna aperta: la prima ancora da fare, e spuntata una passa alla successiva', () => {
    expect(rigaInFuoco(tre, null)).toBe(1);
    expect(rigaInFuoco([fatta('100', '5'), fatta('100', '5'), riga()], null)).toBe(2);
  });

  it('finite tutte resta l\'ultima', () => {
    expect(rigaInFuoco([fatta('100', '5'), fatta('100', '5')], null)).toBe(1);
  });

  it('una riga aperta che non esiste (serie tolta) non rompe niente', () => {
    expect(rigaInFuoco(tre, 9)).toBe(1);
    expect(rigaInFuoco(tre, -1)).toBe(1);
  });

  it('senza serie non c\'e\' niente in fuoco', () => {
    expect(rigaInFuoco([], null)).toBe(-1);
  });
});
