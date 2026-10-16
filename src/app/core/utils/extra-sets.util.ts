/**
 * Le serie di un esercizio durante l'allenamento.
 *
 * Quelle del piano ci sono sempre: sono il lavoro che il coach ha scritto e
 * non si tolgono. Quelle aggiunte a mano sono le uniche che si possono
 * togliere, ed e' `extra` a dire quali sono - non la posizione, che cambia
 * appena se ne aggiunge o se ne leva una.
 */
/**
 * Un blocco di una serie a cluster.
 *
 * Il carico sta QUI e non sulla serie: di solito e' lo stesso in tutti i
 * blocchi, ma non deve esserlo — al terzo blocco si cala, e scrivere il peso
 * una volta sola per tutta la serie costringerebbe a mentire su quello che
 * hai davvero sollevato.
 */
export interface BlockRow {
  reps: string;
  load: string;
  ripPlaceholder: string;
  loadPlaceholder: string;
  done: boolean;
}

export interface SerieRow {
  reps: string;
  load: string;
  done: boolean;
  ripPlaceholder: string;
  loadPlaceholder: string;
  /** Aggiunta durante l'allenamento, non prevista dal piano. */
  extra: boolean;
  /** Solo sulle serie a cluster. Assente = la serie e' un blocco solo. */
  blocks?: BlockRow[];
}

/** Com'e' fatta una riga nella bozza salvata: i campi possono mancare. */
export interface DraftRow {
  reps?: string | null;
  load?: string | null;
  done?: boolean;
  extra?: boolean;
  /** Solo sulle serie a cluster. In un cluster a esaurimento possono essere
   *  piu' di quelli previsti: i blocchi in piu' si ricreano. */
  blocks?: { reps?: string | null; load?: string | null; done?: boolean }[];
}

/**
 * Quante serie puo' arrivare ad avere un esercizio. Non e' un limite
 * dell'allenamento ma della bozza: ogni riga viene riscritta su Firestore a
 * ogni tocco, e un tocco ripetuto per sbaglio non deve poter far crescere il
 * documento senza fine.
 */
export const MAX_SETS_PER_EXERCISE = 20;

/**
 * Quanti blocchi puo' arrivare ad avere una serie. Vale soprattutto per il
 * cluster a esaurimento, dove i blocchi li aggiunge chi si allena: stesso
 * motivo del tetto sulle serie, la bozza finisce su Firestore a ogni tocco.
 */
export const MAX_BLOCKS_PER_SET = 12;

export function canAddSet(rows: readonly SerieRow[]): boolean {
  return rows.length < MAX_SETS_PER_EXERCISE;
}

/**
 * La serie aggiunta nasce sul modello dell'ultima: stessi suggerimenti di
 * ripetizioni e carico. Una serie in piu' e' quasi sempre "ancora una come
 * quella", e partire da zero vorrebbe dire ridigitare tutto.
 */
export function buildExtraSet(rows: readonly SerieRow[]): SerieRow {
  const last = rows[rows.length - 1];
  // Una serie in piu' su un esercizio a cluster e' a cluster anche lei: ha la
  // stessa forma dell'ultima, vuota.
  const blocks = last?.blocks?.map(b => ({
    reps: '', load: '',
    ripPlaceholder: b.ripPlaceholder,
    // Il peso dell'ultima volta e' il punto di partenza della prossima.
    loadPlaceholder: b.load || b.loadPlaceholder,
    done: false
  }));
  return {
    ...(blocks ? { blocks } : {}),
    reps: '',
    load: '',
    done: false,
    // Il valore scritto vale piu' del suggerimento: se l'ultima serie e'
    // andata a 80 kg, la prossima parte da li' e non dal consiglio di prima.
    ripPlaceholder: last ? (last.reps || last.ripPlaceholder) : '',
    loadPlaceholder: last ? (last.load || last.loadPlaceholder) : '',
    extra: true
  };
}

/** Si puo' togliere solo quello che si e' aggiunto: il piano non si tocca. */
export function canRemoveSet(rows: readonly SerieRow[], idx: number): boolean {
  return rows[idx]?.extra === true;
}

/**
 * Toglie una serie aggiunta. Su una serie del piano l'elenco torna uguale a
 * prima: la regola sta qui e non solo nel bottone, cosi' non dipende da quali
 * bottoni la pagina ha disegnato.
 */
export function removeSetAt(rows: readonly SerieRow[], idx: number): SerieRow[] {
  if (!canRemoveSet(rows, idx)) return rows.slice();
  return rows.filter((_, i) => i !== idx);
}

/** La bozza di un esercizio: le sue righe, e il nome che l'esercizio aveva quando e' stata scritta (manca nelle bozze di prima). */
export interface DraftEsercizio {
  name?: string;
  rows: readonly DraftRow[];
}

/**
 * A quale esercizio appartiene ogni bozza.
 *
 * Le bozze si salvano in fila, una per esercizio, nell'ordine di allora. Ma nel
 * builder gli esercizi di un giorno si riordinano: una bozza lasciata a meta'
 * allenamento finirebbe sull'esercizio sbagliato, con i chili della panca sul
 * tricipiti. Dove la bozza ha il nome si cerca per nome (a parita' di nome,
 * nell'ordine in cui compaiono); quelle di prima, senza nome, valgono per
 * posizione, come sempre. Una bozza col nome di un esercizio che non c'e' piu'
 * (rinominato o tolto) prende il suo vecchio posto solo se nessun'altra bozza lo
 * ha reclamato, cosi' un esercizio rinominato tiene i suoi chili e uno tolto non
 * li passa a quello che gli e' scivolato al posto.
 *
 * Ritorna, per ogni esercizio attuale, le righe della sua bozza (o undefined).
 */
export function abbinaBozze(
  nomi: readonly string[],
  bozze: readonly DraftEsercizio[]
): (readonly DraftRow[] | undefined)[] {
  const norm = (n: string | undefined) => (n ?? '').trim();
  const out: (readonly DraftRow[] | undefined)[] = nomi.map(() => undefined);
  const presi = new Set<number>();
  const abbinata = new Set<number>();

  // 1. Per nome, preferendo il posto che aveva se e' ancora lo stesso.
  bozze.forEach((b, i) => {
    if (b.name === undefined) return;
    const nome = norm(b.name);
    const k = norm(nomi[i]) === nome && !presi.has(i)
      ? i
      : nomi.findIndex((n, j) => norm(n) === nome && !presi.has(j));
    if (k < 0) return;
    out[k] = b.rows;
    presi.add(k);
    abbinata.add(i);
  });
  // 2. Le bozze senza nome: per posizione.
  bozze.forEach((b, i) => {
    if (b.name !== undefined || i >= nomi.length || presi.has(i)) return;
    out[i] = b.rows;
    presi.add(i);
    abbinata.add(i);
  });
  // 3. Le bozze di un esercizio che non c'e' piu' con quel nome: il vecchio
  //    posto, se e' libero e nessuna bozza lo ha reclamato per nome.
  bozze.forEach((b, i) => {
    if (abbinata.has(i) || i >= nomi.length || presi.has(i)) return;
    const reclamato = bozze.some(x => x.name !== undefined && norm(x.name) === norm(nomi[i]));
    if (reclamato) return;
    out[i] = b.rows;
    presi.add(i);
  });
  return out;
}

/**
 * Riporta la bozza sulle serie del piano.
 *
 * Oltre il piano ci sono solo le serie aggiunte a mano: si ricreano, se no un
 * refresh a meta' allenamento le farebbe sparire col lavoro che c'e' dentro.
 * Le righe in piu' che la bozza non contrassegna vengono da un piano piu'
 * lungo di prima (il coach ha tolto delle serie) e non appartengono piu' a
 * questo esercizio.
 */
export function mergeDraftRows(rows: readonly SerieRow[], draftRows: readonly DraftRow[]): SerieRow[] {
  const out = rows.map(r => ({ ...r }));
  draftRows.forEach((d, j) => {
    let target: SerieRow | undefined = out[j];
    if (!target) {
      if (!d.extra || !canAddSet(out)) return;
      target = buildExtraSet(out);
      out.push(target);
    }
    target.reps = d.reps ?? '';
    target.load = d.load ?? '';
    target.done = d.done ?? false;
    if (target.blocks && d.blocks) target.blocks = mergeDraftBlocks(target.blocks, d.blocks);
  });
  return out;
}

/**
 * I blocchi di una serie a cluster, come stavano nella bozza. Quelli in piu'
 * si ricreano sul modello dell'ultimo: in un cluster a esaurimento il numero
 * di blocchi lo decide chi si allena, e ricaricando la pagina non deve
 * tornare quello del piano.
 */
function mergeDraftBlocks(
  blocks: readonly BlockRow[],
  draft: readonly { reps?: string | null; load?: string | null; done?: boolean }[]
): BlockRow[] {
  const out = blocks.map(b => ({ ...b }));
  draft.forEach((d, j) => {
    let target: BlockRow | undefined = out[j];
    if (!target) {
      const last = out[out.length - 1];
      if (out.length >= MAX_BLOCKS_PER_SET) return;
      target = {
        reps: '', load: '',
        ripPlaceholder: last?.ripPlaceholder ?? '',
        loadPlaceholder: last ? (last.load || last.loadPlaceholder) : '',
        done: false
      };
      out.push(target);
    }
    target.reps = d.reps ?? '';
    target.load = d.load ?? '';
    target.done = d.done ?? false;
  });
  return out;
}
