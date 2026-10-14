/**
 * Finta implementazione di firebase/firestore per i test, con UNA sola mappa di
 * documenti condivisa da tutti i file che la usano.
 *
 * Il builder Angular esegue i test con `isolate: false`: i moduli sono
 * condivisi fra i file, quindi un servizio caricato da un file che NON mocka
 * firestore resta legato alle funzioni vere anche quando poi lo importa un file
 * che la mock ce l'ha. Da qui i fallimenti a intermittenza, dipendenti
 * dall'ordine dei file (l'errore vero era «Expected first argument to
 * collection() to be a CollectionReference…»: firestore vero, db finto). Le
 * spec risolvono ricaricando il servizio con `vi.resetModules()` dentro il
 * beforeEach; questo modulo va quindi scritto in modo da sopravvivere alla
 * propria rivalutazione — vedi la mappa su globalThis qui sotto.
 */

// La mappa vive su globalThis e non nel modulo: i test chiamano
// `vi.resetModules()` (unico modo per far vedere la mock a un servizio gia'
// caricato da un altro file, vedi le spec), e una `const` di modulo verrebbe
// ricreata a ogni rivalutazione — la spec scriverebbe in una mappa e il
// servizio leggerebbe in un'altra.
const globalScope = globalThis as unknown as { __mockDocs?: Map<string, any> };
export const mockDocs: Map<string, any> = (globalScope.__mockDocs ??= new Map<string, any>());

const merge = (id: string, data: any, mergeMode?: boolean) => {
  const existing = mockDocs.get(id) ?? {};
  mockDocs.set(id, mergeMode ? { ...existing, ...data } : data);
};

export const firestoreMock = {
  // Neutro: se questa mock finisce sotto a un file che costruisce il vero
  // FirebaseService, non deve fare danni.
  initializeFirestore: () => ({}) as any,
  collection: (_db: any, ...segments: string[]) => ({ path: segments.join('/') }),
  // Firestore accetta due forme: doc(collezione, id) e doc(db, 'users', uid,
  // 'protocols', id). In entrambe l'identificativo e' l'ultimo segmento, ed e'
  // quello la chiave della mappa. Prima si prendeva il primo: con la forma
  // lunga il documento finiva sotto 'users' e ogni utente sovrascriveva il
  // precedente.
  doc: (_col: any, ...segmenti: string[]) => ({ id: segmenti[segmenti.length - 1] }),
  // where() e query() filtravano a vuoto: getDocs restituiva comunque TUTTA la
  // mappa. Una lettura che chiede i clienti di un coach si riprendeva anche i
  // documenti di altre raccolte, e un test poteva passare per il motivo
  // sbagliato. Ora i vincoli di uguaglianza valgono davvero.
  query: (col: any, ...vincoli: any[]) => ({ ...col, vincoli }),
  where: (campo: string, op: string, valore: unknown) => ({ campo, op, valore }),

  getDoc: async (ref: { id: string }) => {
    const data = mockDocs.get(ref.id);
    return { exists: () => data !== undefined, data: () => data };
  },
  // `ref` c'e' anche nei risultati veri, ed e' quello che si passa a deleteDoc
  // per cancellare cio' che una lettura ha appena trovato.
  getDocs: async (q?: { vincoli?: { campo: string; op: string; valore: unknown }[] }) => {
    const vincoli = q?.vincoli ?? [];
    const passa = (data: any) => vincoli.every(v =>
      v.op === '==' ? data?.[v.campo] === v.valore : true
    );
    return {
      docs: Array.from(mockDocs.entries())
        .filter(([, data]) => passa(data))
        .map(([id, data]) => ({ id, data: () => data, ref: { id } }))
    };
  },
  setDoc: async (ref: { id: string }, data: any, opts?: { merge?: boolean }) => {
    merge(ref.id, data, opts?.merge);
  },
  updateDoc: async (ref: { id: string }, data: any) => {
    merge(ref.id, data, true);
  },
  deleteDoc: async (ref: { id: string }) => {
    mockDocs.delete(ref.id);
  },

  writeBatch: (_db: any) => {
    const ops: (() => void)[] = [];
    return {
      set: (ref: { id: string }, data: any, opts?: { merge?: boolean }) => {
        ops.push(() => merge(ref.id, data, opts?.merge));
      },
      update: (ref: { id: string }, data: any) => {
        ops.push(() => merge(ref.id, data, true));
      },
      delete: (ref: { id: string }) => {
        ops.push(() => { mockDocs.delete(ref.id); });
      },
      commit: async () => { ops.forEach(op => op()); }
    };
  }
};
