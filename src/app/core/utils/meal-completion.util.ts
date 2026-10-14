/**
 * Trova l'indice del primo pasto non ancora completato. Se tutti i pasti
 * sono completati, restituisce l'ultimo indice (utile per rivedere cosa e
 * stato consumato). Con un array vuoto restituisce 0.
 */
export function firstUncompletedIndex(meals: { completed: boolean }[]): number {
  if (meals.length === 0) return 0;
  const idx = meals.findIndex(m => !m.completed);
  return idx === -1 ? meals.length - 1 : idx;
}
