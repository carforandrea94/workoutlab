import { describe, expect, it } from 'vitest';
import { NamedMeal } from '../../models/diet.model';
import {
  alimentoScelto, comboDi, conCombo, conMacro, contaAlternative, daValoreMacro,
  normalizzaScelta, opzioniMacro, riassuntoCombo, valoreMacro
} from './scelta-pasto.util';

/**
 * Un pasto ha tre livelli di alternative: la combinazione (il pasto intero),
 * le alternative del singolo alimento e quelle del pasto per macro. La scelta
 * di oggi li mette in fila: prima la combinazione, poi un cambio per macro.
 */
function colazione(): NamedMeal {
  return {
    id: 'm1', name: 'Colazione',
    combinations: [
      {
        id: 'base', label: 'Base',
        carb: { name: "Farina d'avena", qty: '50 g', alt: [{ name: "Fiocchi d'avena", qty: '50 g' }, { name: 'Cereali integrali', qty: '40 g' }] },
        protein: { name: 'Albume', qty: '200 g' },
        fat: { name: "Burro d'arachidi", qty: '10 g' }
      },
      {
        id: 'alt1', label: 'Alternativa 1',
        carb: { name: 'Pane di segale', qty: '60 g' },
        protein: { name: 'Fesa di tacchino', qty: '80 g' },
        fat: null
      }
    ],
    alternatives: {
      // "Fiocchi d'avena" c'e' gia' fra quelle dell'alimento: non deve comparire due volte.
      carb: [{ name: 'Frutta fresca', qty: '200 g' }, { name: "fiocchi d'avena ", qty: '50 g' }],
      protein: [{ name: 'Yogurt greco 0%', qty: '200 g' }],
      fat: [{ name: 'Mandorle', qty: '15 g' }]
    }
  };
}

describe('comboDi', () => {
  it('senza scelta e\' la prima combinazione: il piano', () => {
    expect(comboDi(colazione())?.id).toBe('base');
    expect(comboDi(colazione(), {})?.id).toBe('base');
  });

  it('con una scelta valida e\' quella', () => {
    expect(comboDi(colazione(), { combo: 'alt1' })?.id).toBe('alt1');
  });

  it('una combinazione che il piano non ha piu\' torna alla prima', () => {
    expect(comboDi(colazione(), { combo: 'cancellata' })?.id).toBe('base');
  });

  it('un pasto senza combinazioni non si rompe', () => {
    expect(comboDi({ ...colazione(), combinations: [] })).toBeNull();
  });
});

describe('opzioniMacro', () => {
  it('mette in fila il piano, le alternative dell\'alimento e quelle del pasto', () => {
    const m = colazione();
    const o = opzioniMacro(m, comboDi(m), 'carb');
    expect(o.base).toEqual({ name: "Farina d'avena", qty: '50 g' });
    expect(o.alimento.map(v => v.name)).toEqual(["Fiocchi d'avena", 'Cereali integrali']);
    expect(o.pasto.map(v => v.name)).toEqual(['Frutta fresca']);
  });

  it('un alimento che c\'e\' gia\' (anche scritto con maiuscole o spazi diversi) non si ripete', () => {
    const m = colazione();
    const o = opzioniMacro(m, comboDi(m), 'carb');
    expect(contaAlternative(o)).toBe(3);
  });

  it('se la combinazione non prevede il macro, restano le alternative del pasto', () => {
    const m = colazione();
    const o = opzioniMacro(m, comboDi(m, { combo: 'alt1' }), 'fat');
    expect(o.base).toBeNull();
    expect(o.alimento).toEqual([]);
    expect(o.pasto.map(v => v.name)).toEqual(['Mandorle']);
  });

  it('senza alternative e\' solo il piano', () => {
    const m = { ...colazione(), alternatives: { carb: [], protein: [], fat: [] } };
    const o = opzioniMacro(m, comboDi(m), 'protein');
    expect(contaAlternative(o)).toBe(0);
    expect(o.base?.name).toBe('Albume');
  });
});

describe('valore della scelta nel gruppo di radio', () => {
  it('il piano e\' "base"', () => {
    expect(valoreMacro(undefined)).toBe('base');
    expect(valoreMacro(null)).toBe('base');
  });

  it('andata e ritorno', () => {
    expect(daValoreMacro(valoreMacro({ fonte: 'pasto', nome: 'Frutta fresca' }))).toEqual({ fonte: 'pasto', nome: 'Frutta fresca' });
    expect(daValoreMacro(valoreMacro({ fonte: 'alimento', nome: 'Pane: integrale' }))).toEqual({ fonte: 'alimento', nome: 'Pane: integrale' });
  });

  it('"base" o un valore che non si capisce e\' il piano', () => {
    expect(daValoreMacro('base')).toBeNull();
    expect(daValoreMacro('altro:Riso')).toBeNull();
    expect(daValoreMacro('pasto:')).toBeNull();
  });
});

describe('alimentoScelto', () => {
  it('senza scelta e\' il piano, non cambiato', () => {
    const m = colazione();
    expect(alimentoScelto(opzioniMacro(m, comboDi(m), 'carb'))).toEqual({ name: "Farina d'avena", qty: '50 g', cambiato: false });
  });

  it('con una scelta che si ritrova e\' quella, con la sua quantita\'', () => {
    const m = colazione();
    const o = opzioniMacro(m, comboDi(m), 'carb');
    expect(alimentoScelto(o, { fonte: 'pasto', nome: 'Frutta fresca' })).toEqual({ name: 'Frutta fresca', qty: '200 g', cambiato: true });
    expect(alimentoScelto(o, { fonte: 'alimento', nome: 'Cereali integrali' })).toEqual({ name: 'Cereali integrali', qty: '40 g', cambiato: true });
  });

  it('la fonte conta: un nome cercato nell\'elenco sbagliato non si trova', () => {
    const m = colazione();
    const o = opzioniMacro(m, comboDi(m), 'carb');
    expect(alimentoScelto(o, { fonte: 'pasto', nome: 'Cereali integrali' })?.cambiato).toBe(false);
  });

  it('una scelta che il piano non ha piu\' torna al piano invece di indicare altro', () => {
    const m = colazione();
    const o = opzioniMacro(m, comboDi(m), 'carb');
    expect(alimentoScelto(o, { fonte: 'pasto', nome: 'Rimossa' })).toEqual({ name: "Farina d'avena", qty: '50 g', cambiato: false });
  });

  it('macro non previsto e nessuna scelta: niente', () => {
    const m = colazione();
    expect(alimentoScelto(opzioniMacro(m, comboDi(m, { combo: 'alt1' }), 'fat'))).toBeNull();
  });
});

describe('riassuntoCombo', () => {
  it('il pasto intero in una riga, nell\'ordine dei macro', () => {
    expect(riassuntoCombo(colazione().combinations[0])).toBe("Farina d'avena 50 g · Albume 200 g · Burro d'arachidi 10 g");
  });

  it('salta i macro vuoti e le quantita\' mancanti', () => {
    expect(riassuntoCombo({ id: 'x', label: 'X', carb: { name: 'Riso', qty: '' }, protein: null, fat: { name: ' Olio ', qty: '10 g' } }))
      .toBe('Riso · Olio 10 g');
  });
});

describe('normalizzaScelta', () => {
  it('niente da salvare se e\' il piano com\'e\'', () => {
    const m = colazione();
    expect(normalizzaScelta(m, undefined)).toBeUndefined();
    expect(normalizzaScelta(m, {})).toBeUndefined();
    expect(normalizzaScelta(m, { combo: 'base' })).toBeUndefined();
  });

  it('tiene una combinazione diversa dalla prima', () => {
    expect(normalizzaScelta(colazione(), { combo: 'alt1' })).toEqual({ combo: 'alt1' });
  });

  it('toglie una combinazione che non c\'e\' piu\'', () => {
    expect(normalizzaScelta(colazione(), { combo: 'sparita' })).toBeUndefined();
  });

  it('toglie i cambi che non si ritrovano e tiene gli altri', () => {
    const s = normalizzaScelta(colazione(), {
      macro: { carb: { fonte: 'pasto', nome: 'Frutta fresca' }, protein: { fonte: 'alimento', nome: 'Inventato' } }
    });
    expect(s).toEqual({ macro: { carb: { fonte: 'pasto', nome: 'Frutta fresca' } } });
  });

  it('riporta il nome come lo scrive il piano', () => {
    const s = normalizzaScelta(colazione(), { macro: { carb: { fonte: 'pasto', nome: '  FRUTTA fresca' } } });
    expect(s?.macro?.carb?.nome).toBe('Frutta fresca');
  });
});

describe('conCombo e conMacro', () => {
  it('cambiare combinazione azzera i cambi fatti sull\'altra', () => {
    const m = colazione();
    const prima = conMacro(m, undefined, 'carb', { fonte: 'alimento', nome: 'Cereali integrali' });
    expect(prima?.macro?.carb).toBeTruthy();
    expect(conCombo(m, 'alt1')).toEqual({ combo: 'alt1' });
  });

  it('tornare alla prima combinazione e\' tornare al piano', () => {
    expect(conCombo(colazione(), 'base')).toBeUndefined();
  });

  it('un cambio tiene la combinazione scelta', () => {
    const m = colazione();
    const s = conMacro(m, { combo: 'alt1' }, 'protein', { fonte: 'pasto', nome: 'Yogurt greco 0%' });
    expect(s).toEqual({ combo: 'alt1', macro: { protein: { fonte: 'pasto', nome: 'Yogurt greco 0%' } } });
  });

  it('scegliere di nuovo il piano toglie il cambio', () => {
    const m = colazione();
    const s = conMacro(m, undefined, 'carb', { fonte: 'pasto', nome: 'Frutta fresca' });
    expect(conMacro(m, s, 'carb', null)).toBeUndefined();
  });

  it('un cambio non tocca gli altri macro', () => {
    const m = colazione();
    let s = conMacro(m, undefined, 'carb', { fonte: 'pasto', nome: 'Frutta fresca' });
    s = conMacro(m, s, 'fat', { fonte: 'pasto', nome: 'Mandorle' });
    expect(Object.keys(s!.macro!)).toEqual(['carb', 'fat']);
  });
});
