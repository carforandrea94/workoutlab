import {
  SerieRow, MAX_SETS_PER_EXERCISE, MAX_BLOCKS_PER_SET, canAddSet, buildExtraSet,
  canRemoveSet, removeSetAt, mergeDraftRows, abbinaBozze
} from './extra-sets.util';

function planned(reps = '10', over: Partial<SerieRow> = {}): SerieRow {
  return { reps: '', load: '', done: false, ripPlaceholder: reps, loadPlaceholder: '', extra: false, ...over };
}

function piano(n: number): SerieRow[] {
  return Array.from({ length: n }, () => planned());
}

describe('buildExtraSet', () => {
  it('e\' vuota, da fare, e contrassegnata come aggiunta', () => {
    const r = buildExtraSet(piano(3));
    expect(r.reps).toBe('');
    expect(r.load).toBe('');
    expect(r.done).toBe(false);
    expect(r.extra).toBe(true);
  });

  it('eredita i suggerimenti dell\'ultima serie', () => {
    const rows = [planned('10', { ripPlaceholder: '8', loadPlaceholder: '70' })];
    const r = buildExtraSet(rows);
    expect(r.ripPlaceholder).toBe('8');
    expect(r.loadPlaceholder).toBe('70');
  });

  // Quello che hai davvero fatto conta piu' del consiglio di prima.
  it('preferisce i valori scritti ai suggerimenti', () => {
    const rows = [planned('10', { reps: '9', load: '82,5', ripPlaceholder: '8', loadPlaceholder: '70' })];
    const r = buildExtraSet(rows);
    expect(r.ripPlaceholder).toBe('9');
    expect(r.loadPlaceholder).toBe('82,5');
  });

  it('senza serie precedenti non inventa niente', () => {
    const r = buildExtraSet([]);
    expect(r.ripPlaceholder).toBe('');
    expect(r.loadPlaceholder).toBe('');
  });
});

describe('canAddSet', () => {
  it('lascia aggiungere finche\' si sta sotto al tetto', () => {
    expect(canAddSet(piano(MAX_SETS_PER_EXERCISE - 1))).toBe(true);
  });

  it('si ferma al tetto', () => {
    expect(canAddSet(piano(MAX_SETS_PER_EXERCISE))).toBe(false);
  });
});

describe('canRemoveSet', () => {
  it('no su una serie del piano', () => {
    expect(canRemoveSet(piano(3), 1)).toBe(false);
  });

  it('si\' su una aggiunta', () => {
    const rows = [...piano(2), buildExtraSet(piano(2))];
    expect(canRemoveSet(rows, 2)).toBe(true);
  });

  it('no su un indice che non esiste', () => {
    expect(canRemoveSet(piano(2), 5)).toBe(false);
    expect(canRemoveSet(piano(2), -1)).toBe(false);
  });
});

describe('removeSetAt', () => {
  it('toglie la serie aggiunta', () => {
    const rows = [...piano(2), buildExtraSet(piano(2))];
    expect(removeSetAt(rows, 2).length).toBe(2);
  });

  /* La regola vera: il piano del coach non si tocca, qualunque bottone la
     pagina abbia disegnato. */
  it('non toglie una serie del piano', () => {
    const rows = piano(3);
    expect(removeSetAt(rows, 1).length).toBe(3);
  });

  it('non tocca l\'elenco di partenza', () => {
    const rows = [...piano(1), buildExtraSet(piano(1))];
    removeSetAt(rows, 1);
    expect(rows.length).toBe(2);
  });

  it('toglie quella giusta quando ce ne sono piu\' d\'una', () => {
    const a = buildExtraSet(piano(1));
    const b = buildExtraSet(piano(1));
    a.load = 'A'; b.load = 'B';
    const rows = [...piano(1), a, b];
    expect(removeSetAt(rows, 1).map(r => r.load)).toEqual(['', 'B']);
  });
});

describe('mergeDraftRows', () => {
  it('rimette i valori al loro posto', () => {
    const out = mergeDraftRows(piano(2), [
      { reps: '10', load: '60', done: true },
      { reps: '8', load: '65', done: false }
    ]);
    expect(out.map(r => [r.reps, r.load, r.done])).toEqual([['10', '60', true], ['8', '65', false]]);
  });

  it('i campi che la bozza non ha tornano vuoti', () => {
    const out = mergeDraftRows(piano(1), [{}]);
    expect(out[0]).toMatchObject({ reps: '', load: '', done: false });
  });

  it('non tocca le serie che la bozza non copre', () => {
    const out = mergeDraftRows(piano(3), [{ reps: '10', done: true }]);
    expect(out.length).toBe(3);
    expect(out[2].done).toBe(false);
  });

  it('non cambia il contrassegno delle serie del piano', () => {
    const out = mergeDraftRows(piano(2), [{ extra: true }, { extra: true }]);
    expect(out.every(r => !r.extra)).toBe(true);
  });

  // Senza questo, un refresh a meta' allenamento le farebbe sparire.
  it('ricrea le serie aggiunte', () => {
    const out = mergeDraftRows(piano(2), [{}, {}, { reps: '12', load: '40', done: true, extra: true }]);
    expect(out.length).toBe(3);
    expect(out[2]).toMatchObject({ reps: '12', load: '40', done: true, extra: true });
  });

  // Quelle vengono da un piano piu' lungo di prima, non dall'utente.
  it('scarta le righe in piu\' che non sono contrassegnate', () => {
    const out = mergeDraftRows(piano(2), [{}, {}, { reps: '12', done: true }]);
    expect(out.length).toBe(2);
  });

  it('tiene i valori della serie aggiunta anche se il piano si e\' accorciato', () => {
    const out = mergeDraftRows(piano(1), [{}, { reps: '9' }, { reps: '12', extra: true }]);
    expect(out.length).toBe(2);
    expect(out[1]).toMatchObject({ reps: '12', extra: true });
  });

  it('non supera il tetto', () => {
    const draft = Array.from({ length: MAX_SETS_PER_EXERCISE + 5 }, () => ({ extra: true }));
    const out = mergeDraftRows(piano(MAX_SETS_PER_EXERCISE - 1), draft);
    expect(out.length).toBe(MAX_SETS_PER_EXERCISE);
  });

  it('non tocca l\'elenco di partenza', () => {
    const rows = piano(1);
    mergeDraftRows(rows, [{ reps: '10', done: true }]);
    expect(rows[0]).toMatchObject({ reps: '', done: false });
  });
});

describe('mergeDraftRows — i blocchi a cluster', () => {
  function conBlocchi(n: number): SerieRow[] {
    return [{
      reps: '', load: '', done: false, ripPlaceholder: '8+8', loadPlaceholder: '', extra: false,
      blocks: Array.from({ length: n }, () => ({
        reps: '', load: '', ripPlaceholder: '8', loadPlaceholder: '', done: false
      }))
    }];
  }

  it('rimette peso e ripetizioni di ogni blocco', () => {
    const out = mergeDraftRows(conBlocchi(2), [{
      blocks: [{ reps: '8', load: '62,5', done: true }, { reps: '6', load: '55', done: true }]
    }]);
    expect(out[0].blocks?.map(b => [b.reps, b.load, b.done]))
      .toEqual([['8', '62,5', true], ['6', '55', true]]);
  });

  /* A esaurimento i blocchi li aggiunge chi si allena: ricaricando la pagina
     non devono tornare quelli del piano. */
  it('ricrea i blocchi in piu\' col peso dell\'ultimo', () => {
    const out = mergeDraftRows(conBlocchi(1), [{
      blocks: [
        { reps: '5', load: '60', done: true },
        { reps: '5', load: '60', done: true },
        { reps: '4', load: '55', done: true }
      ]
    }]);
    expect(out[0].blocks?.length).toBe(3);
    expect(out[0].blocks?.[2]).toMatchObject({ reps: '4', load: '55', done: true });
  });

  it('non supera il tetto dei blocchi', () => {
    const draft = Array.from({ length: MAX_BLOCKS_PER_SET + 3 }, () => ({ reps: '5', done: true }));
    const out = mergeDraftRows(conBlocchi(1), [{ blocks: draft }]);
    expect(out[0].blocks?.length).toBe(MAX_BLOCKS_PER_SET);
  });

  it('una serie senza blocchi non se li inventa dalla bozza', () => {
    const out = mergeDraftRows(piano(1), [{ blocks: [{ reps: '8', done: true }] }]);
    expect(out[0].blocks).toBeUndefined();
  });
});

/**
 * Nel builder gli esercizi di un giorno si riordinano: una bozza lasciata a meta'
 * allenamento non deve finire sull'esercizio sbagliato. Le righe qui sono
 * etichette per riconoscerle, non serie vere.
 */
describe('abbinaBozze', () => {
  const r = (tag: string) => [{ reps: tag }];
  const b = (name: string | undefined, tag: string) => (name === undefined ? { rows: r(tag) } : { name, rows: r(tag) });

  it('senza riordino ogni bozza resta al suo esercizio', () => {
    const out = abbinaBozze(['A', 'B', 'C'], [b('A', 'a'), b('B', 'b'), b('C', 'c')]);
    expect(out).toEqual([r('a'), r('b'), r('c')]);
  });

  it('dopo un riordino segue il nome, non la posizione', () => {
    // Bozze scritte quando il giorno era C, A, B; ora e' A, B, C.
    const out = abbinaBozze(['A', 'B', 'C'], [b('C', 'c'), b('A', 'a'), b('B', 'b')]);
    expect(out).toEqual([r('a'), r('b'), r('c')]);
  });

  it('le bozze di prima, senza nome, valgono per posizione come sempre', () => {
    const out = abbinaBozze(['A', 'B', 'C'], [b(undefined, 'x'), b(undefined, 'y'), b(undefined, 'z')]);
    expect(out).toEqual([r('x'), r('y'), r('z')]);
  });

  it('con bozze miste, quelle col nome vincono sul posto e le altre prendono quello che resta', () => {
    const out = abbinaBozze(['A', 'B', 'C'], [b('B', 'b'), b(undefined, 'y'), b(undefined, 'z')]);
    // B va a B; la bozza senza nome in posizione 1 trova il posto occupato, quella in 2 va a C.
    expect(out).toEqual([undefined, r('b'), r('z')]);
  });

  it('due esercizi con lo stesso nome si abbinano nell\'ordine', () => {
    const out = abbinaBozze(['Croci', 'Panca', 'Croci'], [b('Croci', '1'), b('Croci', '2'), b('Panca', 'p')]);
    expect(out[0]).toEqual(r('1'));
    expect(out[2]).toEqual(r('2'));
    expect(out[1]).toEqual(r('p'));
  });

  it('due esercizi con lo stesso nome, riordinati, non si scambiano: il posto uguale ha la precedenza', () => {
    const out = abbinaBozze(['Croci', 'Croci'], [b('Croci', '1'), b('Croci', '2')]);
    expect(out).toEqual([r('1'), r('2')]);
  });

  it('a parita\' di nome una bozza tiene il posto che aveva, non il primo libero', () => {
    // Era Panca, Croci; Panca e' diventata Croci: la bozza della seconda Croci resta alla seconda.
    const out = abbinaBozze(['Croci', 'Croci'], [b('Panca', 'p'), b('Croci', 'b')]);
    expect(out).toEqual([undefined, r('b')]);
  });

  it('un esercizio tolto non passa i suoi chili a quello che gli scivola al posto', () => {
    // Era A, B, C; B e' stato tolto: ora A, C.
    const out = abbinaBozze(['A', 'C'], [b('A', 'a'), b('B', 'b'), b('C', 'c')]);
    expect(out).toEqual([r('a'), r('c')]);
  });

  it('un esercizio rinominato senza spostarlo tiene i suoi chili', () => {
    const out = abbinaBozze(['A', 'B2', 'C'], [b('A', 'a'), b('B', 'b'), b('C', 'c')]);
    expect(out).toEqual([r('a'), r('b'), r('c')]);
  });

  it('un esercizio rinominato e spostato non ruba il posto a un altro', () => {
    // Era A, B; ora B, X: la bozza di A non ha piu' un esercizio e il posto 0 e' di B.
    const out = abbinaBozze(['B', 'X'], [b('A', 'a'), b('B', 'b')]);
    expect(out).toEqual([r('b'), undefined]);
  });

  it('piu\' bozze che esercizi (giorno accorciato in fondo): quelle in piu\' si perdono', () => {
    const out = abbinaBozze(['A'], [b('A', 'a'), b('B', 'b')]);
    expect(out).toEqual([r('a')]);
  });

  it('meno bozze che esercizi (giorno allungato): gli esercizi nuovi restano senza', () => {
    const out = abbinaBozze(['A', 'B', 'N'], [b('A', 'a'), b('B', 'b')]);
    expect(out).toEqual([r('a'), r('b'), undefined]);
  });

  it('gli spazi attorno al nome non contano', () => {
    const out = abbinaBozze(['B ', ' A'], [b('A', 'a'), b('B', 'b')]);
    expect(out).toEqual([r('b'), r('a')]);
  });

  it('senza bozze o senza esercizi non fa niente', () => {
    expect(abbinaBozze(['A', 'B'], [])).toEqual([undefined, undefined]);
    expect(abbinaBozze([], [b('A', 'a')])).toEqual([]);
  });
});
