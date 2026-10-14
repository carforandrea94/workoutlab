/**
 * Firestore rifiuta l'intera scrittura se un qualsiasi campo, a qualunque
 * profondita' nell'oggetto, e' esplicitamente `undefined` (non lo ignora,
 * blocca tutto con un errore). Questa funzione ripulisce ricorsivamente
 * un oggetto/array rimuovendo le chiavi undefined (e gli elementi undefined
 * negli array diventano null, dato che gli array non possono avere "buchi"),
 * cosi' un singolo campo dimenticato non fa fallire l'intero salvataggio.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return null as any;
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(v => (v === undefined ? null : sanitizeForFirestore(v))) as any;
  }

  const out: any = {};
  for (const [key, val] of Object.entries(value as any)) {
    if (val === undefined) continue; // chiave omessa invece che scritta come undefined
    out[key] = sanitizeForFirestore(val);
  }
  return out;
}
