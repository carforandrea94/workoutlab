import { describe, it, expect } from 'vitest';
import { firstUncompletedIndex } from './meal-completion.util';

describe('firstUncompletedIndex', () => {
  it('con array vuoto restituisce 0', () => {
    expect(firstUncompletedIndex([])).toBe(0);
  });

  it('se nessun pasto e completato restituisce 0', () => {
    const meals = [{ completed: false }, { completed: false }, { completed: false }];
    expect(firstUncompletedIndex(meals)).toBe(0);
  });

  it('restituisce il primo indice non completato', () => {
    const meals = [{ completed: true }, { completed: true }, { completed: false }, { completed: false }];
    expect(firstUncompletedIndex(meals)).toBe(2);
  });

  it('se tutti i pasti sono completati restituisce l\'ultimo indice', () => {
    const meals = [{ completed: true }, { completed: true }, { completed: true }];
    expect(firstUncompletedIndex(meals)).toBe(2);
  });

  it('con un solo pasto completato restituisce 0', () => {
    expect(firstUncompletedIndex([{ completed: true }])).toBe(0);
  });
});
