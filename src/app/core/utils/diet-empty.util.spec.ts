import { Diet } from '../../models/diet.model';
import { eAlimentoVuoto, senzaCaselleVuote } from './diet-empty.util';

describe('eAlimentoVuoto', () => {
  it('niente, o una casella senza nulla scritto, è vuoto', () => {
    expect(eAlimentoVuoto(null)).toBe(true);
    expect(eAlimentoVuoto(undefined)).toBe(true);
    expect(eAlimentoVuoto({ name: '', qty: '', category: 'carb' })).toBe(true);
  });

  it('gli spazi non sono scrittura', () => {
    expect(eAlimentoVuoto({ name: '  ', qty: ' \t', category: 'carb' })).toBe(true);
  });

  it('basta il nome, o la quantità, o un\'alternativa per non esserlo', () => {
    expect(eAlimentoVuoto({ name: 'Pane', qty: '' })).toBe(false);
    expect(eAlimentoVuoto({ name: '', qty: '80 g' })).toBe(false);
    expect(eAlimentoVuoto({ name: '', qty: '', alt: [{ name: 'Riso', qty: '' }] })).toBe(false);
  });

  it('una lista di alternative vuota non conta', () => {
    expect(eAlimentoVuoto({ name: '', qty: '', alt: [] })).toBe(true);
  });
});

describe('senzaCaselleVuote', () => {
  const dieta = (): Diet => [{
    id: 'p1', name: 'Giorno ON',
    meals: [{
      id: 'm1', name: 'Colazione',
      combinations: [
        {
          id: 'c1', label: 'Base',
          carb: { name: 'Pane', qty: '80 g' },
          protein: { name: '', qty: '', category: 'protein' },
          fat: { name: '', qty: '', category: 'fat' }
        },
        { id: 'c2', label: 'Alt', carb: { name: '', qty: '', category: 'carb' }, protein: null, fat: null }
      ],
      alternatives: { carb: [], protein: [{ name: 'Pollo', qty: '100 g' }], fat: [] },
      supplements: [{ name: 'Creatina', qty: '5 g' }]
    }]
  }];

  it('le caselle vuote diventano null, gli alimenti restano', () => {
    const [c1, c2] = senzaCaselleVuote(dieta())[0].meals[0].combinations;
    expect(c1.carb).toEqual({ name: 'Pane', qty: '80 g' });
    expect(c1.protein).toBeNull();
    expect(c1.fat).toBeNull();
    expect(c2.carb).toBeNull();
  });

  it('un alimento con solo la quantità si tiene', () => {
    const d = dieta();
    d[0].meals[0].combinations[0].protein = { name: '', qty: '3', category: 'protein' };
    expect(senzaCaselleVuote(d)[0].meals[0].combinations[0].protein).toEqual({ name: '', qty: '3', category: 'protein' });
  });

  it('il resto del pasto non si tocca: nomi, id, alternative, integratori', () => {
    const pasto = senzaCaselleVuote(dieta())[0].meals[0];
    expect(pasto.name).toBe('Colazione');
    expect(pasto.combinations.map(c => [c.id, c.label])).toEqual([['c1', 'Base'], ['c2', 'Alt']]);
    expect(pasto.alternatives.protein).toEqual([{ name: 'Pollo', qty: '100 g' }]);
    expect(pasto.supplements).toEqual([{ name: 'Creatina', qty: '5 g' }]);
  });

  it('non modifica l\'originale: l\'editor tiene le sue caselle', () => {
    const d = dieta();
    const prima = JSON.stringify(d);

    senzaCaselleVuote(d);

    expect(JSON.stringify(d)).toBe(prima);
    expect(d[0].meals[0].combinations[0].protein).toEqual({ name: '', qty: '', category: 'protein' });
  });

  it('senza dieta torna una dieta vuota', () => {
    expect(senzaCaselleVuote(undefined)).toEqual([]);
    expect(senzaCaselleVuote([])).toEqual([]);
  });
});
