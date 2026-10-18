import { describe, expect, it } from 'vitest';
import { HistoryListComponent } from './history-list.component';

/**
 * Nello storico ogni seduta ha il numero del suo giorno, come nell'elenco
 * della Scheda: prima c'era l'id interno del giorno ("d1").
 */
describe('HistoryListComponent — il numero del giorno', () => {
  const days = [{ id: 'd1', label: 'Petto' }, { id: 'd2', label: 'Schiena' }, { id: 'd3', label: 'Gambe' }];
  const c = new HistoryListComponent(null as any, null as any, null as any, null as any, null as any, null as any, { days } as any);
  const seduta = (dayId: string, dayLabel?: string) => ({ dayId, dayLabel } as any);

  it('il numero del giorno nel programma, da 1', () => {
    expect(c.numeroGiorno(seduta('d1', 'Petto'))).toBe('1');
    expect(c.numeroGiorno(seduta('d3', 'Gambe'))).toBe('3');
  });

  it('un giorno con lo stesso id ma un altro nome non e\' lo stesso: vale l\'iniziale del nome', () => {
    expect(c.numeroGiorno(seduta('d1', 'spalle'))).toBe('S');
  });

  it('un giorno che il programma non ha piu\' mostra l\'iniziale del nome; senza nome un punto', () => {
    expect(c.numeroGiorno(seduta('d9', 'Braccia'))).toBe('B');
    expect(c.numeroGiorno(seduta('d9'))).toBe('·');
  });
});
