import { describe, expect, it } from 'vitest';
import { NamedMeal } from '../../models/diet.model';
import {
  GiornoDieta, PastoDelGiorno, fotografiaPasto, fotografiaPiano, normalizzaGiorno, rigaGiorno, settimaneDieta, testoAlimento, titoloGiorno
} from './storico-dieta.util';

/**
 * Lo storico della dieta: cosa si fotografa di un giorno, come si rilegge da
 * Firestore e come si mostra per settimane.
 */
describe('storico della dieta', () => {
  const colazione = (): NamedMeal => ({
    id: 'm1', name: 'Colazione',
    combinations: [
      { id: 'c1', label: 'Base', carb: { name: 'Avena', qty: '80 g', alt: [{ name: 'Riso soffiato', qty: '70 g' }] }, protein: { name: 'Albume', qty: '200 g' }, fat: null },
      { id: 'c2', label: 'Dolce', carb: { name: 'Pancake', qty: '100 g' }, protein: { name: 'Whey', qty: '30 g' }, fat: null }
    ],
    alternatives: { carb: [{ name: 'Pane', qty: '60 g' }], protein: [], fat: [{ name: 'Mandorle', qty: '15 g' }] },
    supplements: [{ name: 'Creatina', qty: '5 g' }, { name: 'Omega 3', qty: '' }, { name: '  ', qty: '1' }]
  });
  const pranzo = (): NamedMeal => ({
    id: 'm2', name: 'Pranzo',
    combinations: [{ id: 'p1', label: 'Base', carb: { name: 'Pasta', qty: '90 g' }, protein: { name: 'Pollo', qty: '150 g' }, fat: { name: 'Olio', qty: '10 g' } }],
    alternatives: { carb: [], protein: [], fat: [] }
  });

  describe('la fotografia di un pasto', () => {
    it('il piano com\'e\': gli alimenti della prima combinazione, gli integratori con la quantita\'', () => {
      expect(fotografiaPasto({ meal: colazione(), completed: true })).toEqual({
        id: 'm1', nome: 'Colazione', fatto: true, combinazione: 'Base',
        alimenti: [{ macro: 'carb', nome: 'Avena', qty: '80 g' }, { macro: 'protein', nome: 'Albume', qty: '200 g' }],
        integratori: ['Creatina 5 g', 'Omega 3']
      });
    });

    it('con un\'altra combinazione e un alimento cambiato dice solo quello che si e\' mangiato', () => {
      const p = fotografiaPasto({ meal: colazione(), completed: true, scelta: { combo: 'c2', macro: { carb: { fonte: 'pasto', nome: 'Pane' } } } });
      expect(p.combinazione).toBe('Dolce');
      expect(p.alimenti).toEqual([
        { macro: 'carb', nome: 'Pane', qty: '60 g' },
        { macro: 'protein', nome: 'Whey', qty: '30 g' }
      ]);
    });

    it('un\'alternativa dell\'alimento vale come cambio', () => {
      const p = fotografiaPasto({ meal: colazione(), completed: false, scelta: { macro: { carb: { fonte: 'alimento', nome: 'Riso soffiato' } } } });
      expect(p.alimenti[0]).toEqual({ macro: 'carb', nome: 'Riso soffiato', qty: '70 g' });
      expect(p.fatto).toBe(false);
    });

    it('un macro che la combinazione non ha, aggiunto dalle alternative, c\'e\' come gli altri', () => {
      const p = fotografiaPasto({ meal: colazione(), completed: true, scelta: { macro: { fat: { fonte: 'pasto', nome: 'Mandorle' } } } });
      expect(p.alimenti.at(-1)).toEqual({ macro: 'fat', nome: 'Mandorle', qty: '15 g' });
    });

    it('con una combinazione sola il suo nome non serve; senza integratori l\'elenco e\' vuoto', () => {
      const p = fotografiaPasto({ meal: pranzo(), completed: true });
      expect(p).not.toHaveProperty('combinazione');
      expect(p.integratori).toEqual([]);
      expect(p.alimenti.map(a => a.macro)).toEqual(['carb', 'protein', 'fat']);
    });

    it('nomi vuoti o con spazi: il pasto si chiama "Pasto", gli alimenti senza nome non ci sono', () => {
      const m: NamedMeal = { id: 'x', name: '  ', combinations: [{ id: 'k', label: 'Base', carb: { name: ' ', qty: '1' }, protein: { name: ' Tonno ', qty: ' 80 g ' }, fat: null }], alternatives: { carb: [], protein: [], fat: [] } };
      const p = fotografiaPasto({ meal: m, completed: true });
      expect(p.nome).toBe('Pasto');
      expect(p.alimenti).toEqual([{ macro: 'protein', nome: 'Tonno', qty: '80 g' }]);
    });

    it('il piano: il suo nome e tutti i pasti, fatti e no', () => {
      const piano = fotografiaPiano({ id: 'p', name: ' Giorno ON ', meals: [] }, [{ meal: colazione(), completed: false }, { meal: pranzo(), completed: true }]);
      expect(piano.nome).toBe('Giorno ON');
      expect(piano.pasti.map(p => [p.nome, p.fatto])).toEqual([['Colazione', false], ['Pranzo', true]]);
      expect(fotografiaPiano({ id: 'p', name: '', meals: [] }, []).nome).toBe('Piano');
    });
  });

  describe('rileggere un giorno da Firestore', () => {
    it('un giorno salvato torna uguale', () => {
      const pasto = fotografiaPasto({ meal: colazione(), completed: true, scelta: { combo: 'c2', macro: { carb: { fonte: 'pasto', nome: 'Pane' } } } });
      const giorno = { date: '2026-10-26', piani: { on: { nome: 'Giorno ON', pasti: [pasto] } } };
      expect(normalizzaGiorno('2026-10-26', JSON.parse(JSON.stringify(giorno)))).toEqual(giorno);
    });

    it('senza data valida si prende l\'id; senza nessuna delle due, niente', () => {
      expect(normalizzaGiorno('2026-10-20', { piani: {} })).toEqual({ date: '2026-10-20', piani: {} });
      expect(normalizzaGiorno('2026-10-20', { date: '20/10', piani: {} })!.date).toBe('2026-10-20');
      expect(normalizzaGiorno('boh', { date: 'ieri' })).toBeNull();
      expect(normalizzaGiorno('boh', null)).toBeNull();
    });

    it('quello che non si capisce si scarta, il resto resta', () => {
      const g = normalizzaGiorno('2026-10-20', {
        date: '2026-10-20',
        piani: {
          rotto: { nome: 'Senza pasti' },
          buono: {
            pasti: [
              { nome: '' },
              null,
              { nome: 'Cena', fatto: 'si', alimenti: [{ macro: 'fibre', nome: 'Verdura' }, { macro: 'protein', nome: ' Merluzzo ', qty: 200 }, { macro: 'carb' }, 7], integratori: ['Zinco', '', 3], combinazione: 5 }
            ]
          }
        }
      });
      expect(g).toEqual({
        date: '2026-10-20',
        piani: {
          buono: { nome: 'Piano', pasti: [{ id: 'Cena', nome: 'Cena', fatto: false, alimenti: [{ macro: 'protein', nome: 'Merluzzo', qty: '' }], integratori: ['Zinco'] }] }
        }
      });
    });
  });

  const pasto = (nome: string, fatto: boolean): PastoDelGiorno => ({ id: nome, nome, fatto, alimenti: [], integratori: [] });
  const giorno = (date: string, piani: Record<string, [string, PastoDelGiorno[]]>): GiornoDieta => ({
    date, piani: Object.fromEntries(Object.entries(piani).map(([id, [nome, pasti]]) => [id, { nome, pasti }]))
  });

  describe('un giorno nello storico', () => {
    it('solo i pasti fatti, i piani con almeno uno, e il conto su tutti i pasti di quei piani', () => {
      const r = rigaGiorno(giorno('2026-10-20', {
        off: ['Giorno OFF', [pasto('Cena', false)]],
        on: ['Giorno ON', [pasto('Colazione', true), pasto('Pranzo', false), pasto('Cena', true)]]
      }), '2026-10-26')!;
      expect(r.piani).toBe('Giorno ON');
      expect([r.fatti, r.totali]).toEqual([2, 3]);
      expect(r.dettaglio).toEqual([{ nome: 'Giorno ON', pasti: [pasto('Colazione', true), pasto('Cena', true)] }]);
      expect(r.titolo).toBe('Martedì 20 ottobre');
    });

    it('due piani con pasti fatti: tutti e due, in ordine di nome', () => {
      const r = rigaGiorno(giorno('2026-10-26', {
        z: ['Giorno ON', [pasto('Colazione', true)]],
        a: ['Giorno OFF', [pasto('Cena', true), pasto('Spuntino', false)]]
      }), '2026-10-26')!;
      expect(r.piani).toBe('Giorno OFF · Giorno ON');
      expect([r.fatti, r.totali]).toEqual([2, 3]);
      expect(r.titolo).toBe('Oggi');
    });

    it('un giorno senza niente di fatto non c\'e\'', () => {
      expect(rigaGiorno(giorno('2026-10-25', { on: ['Giorno ON', [pasto('Colazione', false)]] }), '2026-10-26')).toBeNull();
      expect(rigaGiorno(giorno('2026-10-25', {}), '2026-10-26')).toBeNull();
    });

    it('il titolo: Oggi, Ieri, poi la data per esteso, con la maiuscola', () => {
      expect(titoloGiorno('2026-10-26', '2026-10-26')).toBe('Oggi');
      expect(titoloGiorno('2026-10-25', '2026-10-26')).toBe('Ieri');
      expect(titoloGiorno('2026-10-24', '2026-10-26')).toBe('Sabato 24 ottobre');
    });

    it('un alimento si legge col nome e la quantita\', se c\'e\'', () => {
      expect(testoAlimento({ macro: 'carb', nome: 'Riso', qty: '70 g' })).toBe('Riso 70 g');
      expect(testoAlimento({ macro: 'fat', nome: 'Olio', qty: '' })).toBe('Olio');
    });
  });

  describe('le settimane', () => {
    const fatto = (date: string) => giorno(date, { on: ['Giorno ON', [pasto('Colazione', true)]] });

    it('dalla piu\' recente, i giorni dal piu\' recente, solo le settimane con qualcosa', () => {
      const { settimane, nascoste } = settimaneDieta([
        fatto('2026-10-13'), fatto('2026-10-19'), fatto('2026-10-26'), fatto('2026-10-21'),
        giorno('2026-10-06', { on: ['Giorno ON', [pasto('Colazione', false)]] })
      ], '2026-10-26', 0);
      expect(settimane.map(s => [s.lunedi, s.label, s.corrente])).toEqual([
        ['2026-10-26', '26 ott – 1 nov', true],
        ['2026-10-19', '19 – 25 ott', false],
        ['2026-10-12', '12 – 18 ott', false]
      ]);
      expect(settimane[1].giorni.map(g => g.date)).toEqual(['2026-10-21', '2026-10-19']);
      expect(nascoste).toBe(0);
    });

    it('oltre il tetto le piu\' vecchie si nascondono, e si sa quante', () => {
      const giorni = ['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05'].map(fatto);
      const { settimane, nascoste } = settimaneDieta(giorni, '2026-10-26', 2);
      expect(settimane.map(s => s.lunedi)).toEqual(['2026-10-26', '2026-10-19']);
      expect(nascoste).toBe(2);
    });

    it('senza giorni, nessuna settimana', () => {
      expect(settimaneDieta([], '2026-10-26', 12)).toEqual({ settimane: [], nascoste: 0 });
    });
  });
});
