import { describe, expect, it } from 'vitest';
import { rmTable } from './load-estimate.util';
import { DatiCarico, azioneInBasso, fonteDelCarico, opzioneScelta, opzioniCarico } from './carico-serie.util';

/**
 * Le fonti di un peso per una serie: l'ultima volta, la stima dal massimale per
 * le ripetizioni nella ruota, la percentuale del programma. Una scelta fra
 * numeri, invece di quattro numeri da leggere insieme.
 */
function dati(extra: Partial<DatiCarico> = {}): DatiCarico {
  return {
    serie: 0,
    ultima: { data: '03/10', serie: [{ load: '33', reps: '10' }, { load: '32,5', reps: '9' }] },
    ripetizioni: 10,
    rmRows: rmTable(47.5),
    programma: { percent: 85, load: 40.5, reps: 6 },
    previste: 10,
    soglia: 12,
    ...extra
  };
}

describe('opzioniCarico', () => {
  it('nell\'ordine in cui si guardano: l\'ultima volta, la stima, il programma', () => {
    expect(opzioniCarico(dati()).map(o => o.chiave)).toEqual(['ultima', 'rm', 'programma']);
  });

  it('l\'ultima volta e\' la serie con lo stesso numero, con data e ripetizioni', () => {
    const [ultima] = opzioniCarico(dati({ serie: 1 }));
    expect(ultima).toMatchObject({
      titolo: 'Come l\'ultima volta', dettaglio: 'Serie 2 del 03/10, 9 ripetizioni',
      kg: 32.5, breve: 'come il 03/10', avviso: null
    });
  });

  it('senza le ripetizioni di quella volta resta la data', () => {
    const d = dati({ ultima: { data: '03/10', serie: [{ load: '33', reps: null }] } });
    expect(opzioniCarico(d)[0].dettaglio).toBe('Serie 1 del 03/10');
  });

  it('una sola ripetizione si dice al singolare', () => {
    const d = dati({ ultima: { data: '03/10', serie: [{ load: '100', reps: '1' }] }, ripetizioni: 1 });
    const [ultima, rm] = opzioniCarico(d);
    expect(ultima.dettaglio).toBe('Serie 1 del 03/10, 1 ripetizione');
    expect(rm.titolo).toBe('Per 1 ripetizione');
  });

  it('senza peso quella volta (o con un riassunto di cluster) l\'opzione non c\'e\'', () => {
    for (const load of [null, '', '62,5-55', '0']) {
      const d = dati({ ultima: { data: '03/10', serie: [{ load, reps: '10' }] } });
      expect(opzioniCarico(d).map(o => o.chiave)).not.toContain('ultima');
    }
  });

  it('una serie in piu\' dell\'ultima volta non ha un\'ultima volta', () => {
    expect(opzioniCarico(dati({ serie: 4 })).map(o => o.chiave)).toEqual(['rm', 'programma']);
  });

  it('la stima segue le ripetizioni nella ruota, con la percentuale', () => {
    const tabella = rmTable(47.5);
    const otto = tabella.find(r => r.reps === 8)!;
    const rm = opzioniCarico(dati({ ripetizioni: 8 })).find(o => o.chiave === 'rm')!;
    expect(rm).toMatchObject({ titolo: 'Per 8 ripetizioni', kg: otto.load, breve: `${otto.percent}% del massimale`, avviso: null });
    expect(rm.dettaglio).toBe(`${otto.percent}% del massimale stimato`);
  });

  it('sopra la soglia la stima avvisa che si allarga', () => {
    const rm = opzioniCarico(dati({ ripetizioni: 14 })).find(o => o.chiave === 'rm')!;
    expect(rm.avviso).toContain('Sopra le 12 ripetizioni');
    expect(opzioniCarico(dati({ ripetizioni: 12 })).find(o => o.chiave === 'rm')!.avviso).toBeNull();
  });

  it('senza massimale, o oltre la tabella, la stima non c\'e\'', () => {
    expect(opzioniCarico(dati({ rmRows: null })).map(o => o.chiave)).not.toContain('rm');
    expect(opzioniCarico(dati({ ripetizioni: 30 })).map(o => o.chiave)).not.toContain('rm');
    expect(opzioniCarico(dati({ ripetizioni: null })).map(o => o.chiave)).not.toContain('rm');
  });

  it('il programma dice quante ne escono, e avvisa se il piano ne chiede altre', () => {
    const p = opzioniCarico(dati()).find(o => o.chiave === 'programma')!;
    expect(p).toMatchObject({ titolo: 'Dal programma, 85%', dettaglio: 'Circa 6 ripetizioni', kg: 40.5, breve: 'programma 85%' });
    expect(p.avviso).toBe('Oggi il piano ne chiede 10: a questo peso ne escono circa 6.');
  });

  it('con meno di due ripetizioni di scarto il programma non avvisa', () => {
    expect(opzioniCarico(dati({ previste: 7 })).find(o => o.chiave === 'programma')!.avviso).toBeNull();
    expect(opzioniCarico(dati({ previste: 8 })).find(o => o.chiave === 'programma')!.avviso).not.toBeNull();
    expect(opzioniCarico(dati({ previste: null })).find(o => o.chiave === 'programma')!.avviso).toBeNull();
  });

  it('senza percentuale del programma l\'opzione non c\'e\'', () => {
    expect(opzioniCarico(dati({ programma: null })).map(o => o.chiave)).toEqual(['ultima', 'rm']);
  });

  it('senza storia non c\'e\' niente da scegliere', () => {
    expect(opzioniCarico(dati({ ultima: null, rmRows: null, programma: null }))).toEqual([]);
  });
});

describe('opzioneScelta', () => {
  const opzioni = opzioniCarico(dati());

  it('e\' quella col peso nella ruota', () => {
    expect(opzioneScelta(opzioni, 40.5)?.chiave).toBe('programma');
    expect(opzioneScelta(opzioni, 33)?.chiave).toBe('ultima');
  });

  it('un peso girato a mano non e\' di nessuna', () => {
    expect(opzioneScelta(opzioni, 34)).toBeNull();
    expect(opzioneScelta(opzioni, null)).toBeNull();
  });

  it('se due coincidono vale la prima', () => {
    const d = dati({ programma: { percent: 70, load: 33, reps: 12 } });
    expect(opzioneScelta(opzioniCarico(d), 33)?.chiave).toBe('ultima');
  });
});

describe('fonteDelCarico', () => {
  const opzioni = opzioniCarico(dati());

  it('con la ruota sul suggerimento dice da dove viene', () => {
    expect(fonteDelCarico(opzioni, '', '33')).toBe('come il 03/10');
  });

  it('scelto dal foglio dice quale fonte', () => {
    expect(fonteDelCarico(opzioni, '40,5', '33')).toBe('programma 85%');
  });

  it('girato a mano e\' tuo', () => {
    expect(fonteDelCarico(opzioni, '34', '33')).toBe('scelto da te');
    expect(fonteDelCarico([], '34', '')).toBe('scelto da te');
  });

  it('senza peso e senza suggerimento non dice niente', () => {
    expect(fonteDelCarico(opzioni, '', '')).toBeNull();
  });

  it('un suggerimento che non viene da nessuna fonte non si spaccia per una', () => {
    expect(fonteDelCarico(opzioni, '', '50')).toBeNull();
  });
});

describe('azioneInBasso', () => {
  const righe = (...fatte: boolean[]) => fatte.map(done => ({ done }));

  it('sulla serie da fare: "Fatta", con il suo numero', () => {
    expect(azioneInBasso({ righe: righe(true, false, false), attiva: 1, cluster: null, ultimo: false }))
      .toEqual({ tipo: 'fatta', serie: 2, totale: 3 });
  });

  it('su una serie a cluster: il blocco', () => {
    expect(azioneInBasso({ righe: righe(false), attiva: 0, cluster: { etichetta: 'Blocco 1 di 2', chiudibile: false }, ultimo: false }))
      .toEqual({ tipo: 'blocco', etichetta: 'Blocco 1 di 2', chiudibile: false });
  });

  it('su una serie fatta riaperta: si torna alla prima da fare', () => {
    expect(azioneInBasso({ righe: righe(true, true, false), attiva: 0, cluster: null, ultimo: false }))
      .toEqual({ tipo: 'torna', serie: 3 });
  });

  it('senza una serie aperta, ma con serie da fare: si torna a quella', () => {
    expect(azioneInBasso({ righe: righe(true, false), attiva: null, cluster: null, ultimo: false }))
      .toEqual({ tipo: 'torna', serie: 2 });
  });

  it('tutte fatte: si va avanti, alla chiusura se e\' l\'ultimo esercizio', () => {
    expect(azioneInBasso({ righe: righe(true, true), attiva: null, cluster: null, ultimo: false }))
      .toEqual({ tipo: 'avanti', chiusura: false });
    expect(azioneInBasso({ righe: righe(true, true), attiva: 1, cluster: null, ultimo: true }))
      .toEqual({ tipo: 'avanti', chiusura: true });
  });

  it('un esercizio senza serie non blocca: si va avanti', () => {
    expect(azioneInBasso({ righe: [], attiva: null, cluster: null, ultimo: false })).toEqual({ tipo: 'avanti', chiusura: false });
  });
});
