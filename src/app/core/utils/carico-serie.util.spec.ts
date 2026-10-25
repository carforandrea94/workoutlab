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

/**
 * Due correzioni del peso stimato: dal secondo blocco di un cluster vale il
 * peso del primo; e se l'ordine degli esercizi porta qui piu' stanchi, i pesi
 * stimati scendono e la ragione si legge.
 */
describe('opzioniCarico — cluster e ordine', () => {
  const tabella = rmTable(100);
  const riga = (n: number) => tabella.find(r => r.reps === n)!;

  it('dal secondo blocco la stima e\' il peso del primo: in un 8+6 il blocco da 6 non chiede di piu\'', () => {
    const primo = opzioniCarico(dati({ blocco: 1, ripetizioni: 8, rmRows: tabella, primoBlocco: null })).find(o => o.chiave === 'rm')!;
    const secondo = opzioniCarico(dati({ blocco: 2, ripetizioni: 6, rmRows: tabella, primoBlocco: 8 })).find(o => o.chiave === 'rm')!;
    expect(primo).toMatchObject({ titolo: 'Per 8 ripetizioni', kg: riga(8).load });
    expect(secondo).toMatchObject({
      titolo: 'Come il primo blocco', kg: riga(8).load, breve: 'come il primo blocco',
      dettaglio: `${riga(8).percent}% del massimale, per 8 ripetizioni: in un cluster il peso è della serie`
    });
    // Prima: il peso per 6 ripetizioni, piu' alto di quello del primo blocco.
    expect(secondo.kg).toBeLessThan(riga(6).load);
  });

  it('sul primo blocco il primo blocco non conta, e fuori dai cluster nemmeno', () => {
    expect(opzioniCarico(dati({ blocco: 1, ripetizioni: 6, rmRows: tabella, primoBlocco: 8 })).find(o => o.chiave === 'rm')!.kg).toBe(riga(6).load);
    expect(opzioniCarico(dati({ ripetizioni: 6, rmRows: tabella, primoBlocco: 8 })).find(o => o.chiave === 'rm')!.kg).toBe(riga(6).load);
  });

  it('con la fatica dell\'ordine stima e programma scendono, e lo dicono', () => {
    const fatica = { percento: 5, motivo: 'Oggi arrivi qui con un esercizio di Petto in più rispetto al 03/10' };
    const [ultima, rm, programma] = opzioniCarico(dati({ ripetizioni: 10, rmRows: tabella, fatica }));
    expect(rm.kg).toBe(Math.round(riga(10).load * 0.95 * 2) / 2);
    expect(rm.dettaglio).toBe(`${riga(10).percent}% del massimale stimato, −5% per l'ordine`);
    expect(rm.breve).toBe(`${riga(10).percent}% del massimale, −5% per l'ordine`);
    expect(programma.kg).toBe(Math.round(40.5 * 0.95 * 2) / 2);
    expect(programma.dettaglio).toBe('Circa 6 ripetizioni, −5% per l\'ordine');
    expect(programma.breve).toBe('programma 85%, −5% per l\'ordine');
    // L'ultima volta e' un fatto: il peso resta, e la ragione si legge.
    expect(ultima.kg).toBe(33);
    expect(ultima.avviso).toBe('Oggi arrivi qui con un esercizio di Petto in più rispetto al 03/10: con questo peso potrebbero uscirne meno.');
  });

  it('senza fatica niente cambia', () => {
    const senza = opzioniCarico(dati({ fatica: null }));
    const zero = opzioniCarico(dati({ fatica: { percento: 0, motivo: 'x' } }));
    expect(senza).toEqual(opzioniCarico(dati()));
    expect(zero).toEqual(opzioniCarico(dati()));
  });
});

describe('opzioniCarico — un passo avanti o indietro', () => {
  it('tutte le ripetizioni uscite: dopo l\'ultima volta, "Prova di più" con un passo', () => {
    const opzioni = opzioniCarico(dati({ piu: true }));
    expect(opzioni.map(o => o.chiave)).toEqual(['ultima', 'piu', 'rm', 'programma']);
    expect(opzioni[1]).toEqual({
      chiave: 'piu', titolo: 'Prova di più',
      dettaglio: 'Il 03/10 sono uscite tutte le ripetizioni: un passo in più',
      avviso: null, kg: 35.5, breve: '+2,5 kg sul 03/10'
    });
    // La serie 2 era a 32,5: il passo e' sul suo peso.
    expect(opzioniCarico(dati({ serie: 1, piu: true }))[1].kg).toBe(35);
  });

  it('senza un peso dell\'ultima volta non c\'e\' un passo da fare', () => {
    expect(opzioniCarico(dati({ serie: 4, piu: true })).map(o => o.chiave)).toEqual(['rm', 'programma']);
  });

  it('con la fatica dell\'ordine il passo avanti non c\'e\': si contraddirebbero', () => {
    const fatica = { percento: 5, motivo: 'Oggi arrivi qui con un esercizio di Petto in più' };
    expect(opzioniCarico(dati({ piu: true, fatica })).map(o => o.chiave)).toEqual(['ultima', 'rm', 'programma']);
  });

  it('dopo una pausa "Per ripartire": il peso dell\'ultima volta meno lo sconto, e le stime scendono', () => {
    const tabella = rmTable(100);
    const riga10 = tabella.find(r => r.reps === 10)!;
    const [ultima, ripresa, rm, programma] = opzioniCarico(dati({ pausa: 5, piu: true, rmRows: tabella }));
    expect(ripresa).toEqual({
      chiave: 'ripresa', titolo: 'Per ripartire',
      dettaglio: 'Il peso del 03/10 meno il 5%: si riprende il ritmo',
      avviso: null, kg: Math.round(33 * 0.95 * 2) / 2, breve: '−5% sul 03/10'
    });
    // L'ultima volta resta un fatto, con la ragione per cui oggi potrebbe pesare di piu'.
    expect(ultima).toMatchObject({ kg: 33, avviso: 'Dopo una pausa: con questo peso potrebbero uscirne meno.' });
    expect(rm.kg).toBe(Math.round(riga10.load * 0.95 * 2) / 2);
    expect(rm.dettaglio).toBe(`${riga10.percent}% del massimale stimato, −5% per ripartire`);
    expect(programma.breve).toBe('programma 85%, −5% per ripartire');
  });

  it('pausa e ordine insieme si sommano, fino al 15%, e la fatica resta la ragione detta', () => {
    const fatica = { percento: 10, motivo: 'Oggi arrivi qui con 2 esercizi di Petto in più' };
    const [ultima, ripresa, , programma] = opzioniCarico(dati({ pausa: 10, fatica }));
    expect(ultima.avviso).toBe('Oggi arrivi qui con 2 esercizi di Petto in più: con questo peso potrebbero uscirne meno.');
    // "Per ripartire" e' il passo indietro della pausa, non della fatica.
    expect(ripresa.kg).toBe(Math.round(33 * 0.9 * 2) / 2);
    expect(programma.kg).toBe(Math.round(40.5 * 0.85 * 2) / 2);
    expect(programma.breve).toBe('programma 85%, −15% per ordine e ripresa');
  });

  it('senza pausa e senza passo niente cambia', () => {
    expect(opzioniCarico(dati({ pausa: 0, piu: false }))).toEqual(opzioniCarico(dati()));
    expect(opzioniCarico(dati({ pausa: null }))).toEqual(opzioniCarico(dati()));
  });

  it('il passo e lo sconto si riconoscono anche dalla riga della serie', () => {
    const conPasso = opzioniCarico(dati({ piu: true }));
    expect(fonteDelCarico(conPasso, '', '35,5')).toBe('+2,5 kg sul 03/10');
    const conPausa = opzioniCarico(dati({ pausa: 10 }));
    expect(fonteDelCarico(conPausa, '', '29,5')).toBe('−10% sul 03/10');
  });
});
