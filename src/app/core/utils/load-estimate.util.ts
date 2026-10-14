/**
 * Massimale, e carico da usare per un dato numero di ripetizioni.
 *
 * Il problema: 36 kg per 6 ripetizioni e 36 kg per 10 non sono lo stesso
 * sforzo. Per confrontarli si passa dal massimale teorico (1RM), che e' la
 * moneta comune fra schemi diversi: si stima il massimale da una serie
 * realmente fatta, poi lo si riconverte nel carico giusto per le ripetizioni
 * che si vogliono fare.
 *
 * UNA formula sola, in tutte e due le direzioni - Brzycki (1993):
 *
 *     1RM     = carico * 36 / (37 - ripetizioni)
 *     carico  = 1RM * (37 - ripetizioni) / 36
 *
 * La scelta e' stata fatta confrontando le sette formule classiche con la
 * tabella ripetizioni/percentuale di Baechle & Earle (NSCA, "Essentials of
 * Strength Training and Conditioning"), che e' il riferimento di fatto.
 * Percentuale del massimale da caricare, 1-10 ripetizioni:
 *
 *   rip           1     2     3     4     5     6     7     8     9    10
 *   Baechle   100,0  95,0  93,0  90,0  87,0  85,0  83,0  80,0  77,0  75,0
 *   Lander     98,6  96,0  93,3  90,6  87,9  85,3  82,6  79,9  77,3  74,6
 *   Brzycki   100,0  97,2  94,4  91,7  88,9  86,1  83,3  80,6  77,8  75,0
 *   Wathen     98,7  95,1  91,8  88,7  85,8  83,1  80,6  78,3  76,2  74,2
 *   Epley      96,8  93,8  90,9  88,2  85,7  83,3  81,1  78,9  76,9  75,0
 *   Lombardi  100,0  93,3  89,6  87,1  85,1  83,6  82,3  81,2  80,3  79,4
 *   O'Conner   97,6  95,2  93,0  90,9  88,9  87,0  85,1  83,3  81,6  80,0
 *   Mayhew     91,9  89,7  87,7  85,8  84,0  82,3  80,7  79,2  77,7  76,4
 *
 *   scarto medio:  Lander 0,56 - Brzycki 1,00 - Wathen 1,27 - Epley 1,43 -
 *                  Lombardi 2,09 - O'Conner 2,25 - Mayhew 3,37 punti
 *
 * Lander aderisce meglio di tutte, ma a una ripetizione da' il 98,6% del
 * massimale, e cosi' Wathen, Epley, O'Conner e Mayhew: chiedere il carico per
 * una singola restituirebbe un numero diverso dal massimale appena
 * dichiarato. Le uniche due che valgono esattamente 1 a una ripetizione sono
 * Brzycki e Lombardi, e Lombardi sbaglia il doppio e a quindici ripetizioni
 * pretende il 76% del massimale (dove tutte le tabelle di programmazione
 * stanno fra il 60 e il 65%). Resta Brzycki, che paga 0,44 punti di aderenza
 * rispetto a Lander - meno di mezzo chilo su un massimale di cento, sotto il
 * disco piu' piccolo che esista - e in cambio non si contraddice mai.
 *
 * Due proprieta' che si vedono a schermo e che nessun'altra formula ha
 * insieme: la riga "1 ripetizione" E' il massimale, e la riga delle
 * ripetizioni appena fatte restituisce il peso appena sollevato (chi ha fatto
 * 80 x 6 legge 80 alla riga 6). Una tabella smentita dal bilanciere che si ha
 * in mano non la guarda piu' nessuno.
 *
 * Il prezzo, dichiarato: verso l'ALTO, cioe' stimando il massimale da una
 * serie lunga, Brzycki e' la piu' generosa delle sette (da una serie da venti
 * stima il 212% del carico, dove Epley si ferma al 167%). Per questo la SERIE
 * da cui si stima non puo' superare MAX_TRUSTED_REPS ripetizioni. E' un
 * limite su cio' che si legge, non su cio' che si proietta: la tabella scende
 * fino a quindici ripetizioni, e li' Brzycki (61,1%) e Lander (61,2%) dicono
 * la stessa cosa.
 */

/**
 * Un numero vero, o niente.
 *
 * Quello che si legge da una seduta salvata e' testo: lo scrive chi si
 * allena, e certe volte non e' una misura ma una frase - il riassunto di una
 * serie a cluster ("5+5+3"), un carico che scende ("62,5-55"), una nota ("8
 * per lato"). parseFloat ne cava il primo pezzo senza battere ciglio, e
 * quel pezzo arriva alle formule come se fosse un carico: da "5+5+3" un 5,
 * da "62,5-55" un 62,5. Numeri plausibili, serie mai esistite.
 *
 * Qui passa solo quello che e' tutto un numero, e positivo.
 */
export function numeroSevero(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? n : null;
}

/** Serie realmente eseguita, gia' convertita in numeri. */
export interface PerformedSet {
  load: number;
  reps: number;
}

/**
 * Oltre questo numero di ripetizioni non si stima piu' niente da una serie.
 *
 * Confrontando le sette formule classiche (Epley, Brzycki, Lander, Lombardi,
 * O'Conner, Mayhew, Wathen) sullo stesso carico, lo scarto fra la piu' alta e
 * la piu' bassa resta sotto il 7% fino a dieci ripetizioni, e poi esplode:
 * 11,8% a dodici, 21,9% a quindici, 45,3% a venti. Oltre le dodici non e' una
 * stima con un margine, e' un'opinione - e a quel punto il limite di chi si
 * allena e' il fiato, non la forza.
 */
export const MAX_TRUSTED_REPS = 12;

/** Fino a quante ripetizioni scende la tabella dei massimali. */
export const RM_TABLE_MAX_REPS = 15;

/** Massimale teorico stimato da una serie. Restituisce 0 se la serie non e' utilizzabile. */
export function estimateOneRepMax(load: number, reps: number): number {
  if (!isFinite(load) || !isFinite(reps)) return 0;
  if (load <= 0 || reps <= 0 || reps > MAX_TRUSTED_REPS) return 0;
  return load * 36 / (37 - reps);
}

/**
 * Carico che corrisponde a un dato numero di ripetizioni, senza arrotondamenti
 * da bilanciere: e' la percentuale del massimale, al mezzo chilo. 0 quando i
 * numeri in ingresso non dicono niente.
 */
export function loadAtReps(oneRepMax: number, reps: number): number {
  if (!isFinite(oneRepMax) || !isFinite(reps)) return 0;
  if (oneRepMax <= 0 || reps <= 0 || reps > 36) return 0;
  return Math.round(oneRepMax * (37 - reps) / 36 * 2) / 2;
}

/**
 * Serie di riferimento fra quelle gia' fatte: quella che esprime il massimale
 * piu' alto, non quella col carico piu' alto. Un 40 kg x 3 vale piu' di un
 * 36 kg x 6, e senza questo confronto il primo verrebbe ignorato.
 */
export function bestSet(sets: PerformedSet[]): PerformedSet | null {
  let best: PerformedSet | null = null;
  let bestOrm = 0;
  for (const s of sets) {
    const orm = estimateOneRepMax(s.load, s.reps);
    if (orm > bestOrm) { bestOrm = orm; best = s; }
  }
  return best;
}

/** Una riga della tabella: con questo carico si fanno queste ripetizioni. */
export interface RmRow {
  reps: number;
  load: number;
  /** Percentuale del massimale, arrotondata all'unita': serve a leggere la riga. */
  percent: number;
}

/**
 * La tabella dei massimali: per ogni numero di ripetizioni da 1 a
 * RM_TABLE_MAX_REPS, il carico corrispondente. La riga 1 e' il massimale
 * stesso (Brzycki vale esattamente 1 a una ripetizione).
 */
export function rmTable(oneRepMax: number, maxReps = RM_TABLE_MAX_REPS): RmRow[] {
  if (!isFinite(oneRepMax) || oneRepMax <= 0) return [];
  const rows: RmRow[] = [];
  for (let reps = 1; reps <= maxReps; reps++) {
    const load = loadAtReps(oneRepMax, reps);
    if (load > 0) rows.push({ reps, load, percent: Math.round((37 - reps) / 36 * 100) });
  }
  return rows;
}

/**
 * Il carico che corrisponde a una percentuale del massimale, al mezzo chilo.
 *
 * E' la percentuale secca, non la riga della tabella: 80 vuol dire 80% del
 * massimale, qualunque cosa chieda il protocollo quel giorno.
 */
export function loadAtPercent(oneRepMax: number, percent: number): number {
  if (!isFinite(oneRepMax) || !isFinite(percent)) return 0;
  if (oneRepMax <= 0 || percent <= 0) return 0;
  return Math.round(oneRepMax * percent / 100 * 2) / 2;
}

/**
 * Quante ripetizioni escono, secondo Brzycki, a una data percentuale del
 * massimale. E' l'inversa della tabella: 100% da' 1, 75% ne da' 10.
 *
 * Serve a dire a chi legge dove lo porta la percentuale che ha scelto. Una
 * percentuale fissa su tutto il programma e le ripetizioni scritte dal coach
 * possono contraddirsi - 80% su un giorno da 10 ripetizioni e' un peso con
 * cui le 10 non escono - e il numero qui accanto e' l'unico modo per
 * accorgersene prima di essere sotto il bilanciere.
 */
export function repsAtPercent(percent: number): number {
  if (!isFinite(percent) || percent <= 0 || percent > 100) return 0;
  return Math.max(1, Math.round(37 - 36 * percent / 100));
}

export interface OneRepMaxEstimate {
  /** Massimale stimato, arrotondato al mezzo chilo. */
  value: number;
  /** La serie da cui viene: senza, il numero non si puo' giudicare. */
  from: PerformedSet;
}

/**
 * Il massimale stimato da un gruppo di serie - tipicamente quelle di una
 * sessione sola - preso dalla migliore, cioe' quella che esprime il massimale
 * piu' alto, non quella col carico piu' alto.
 *
 * Restituisce null quando non c'e' niente di mostrabile: nessuna serie dentro
 * le ripetizioni attendibili, o un carico che non e' un numero.
 *
 * Quello che questa funzione NON puo' sapere: se la serie e' stata portata
 * vicino al cedimento. Tutte queste formule lo danno per scontato, e in
 * un'app dove il carico lo prescrive il coach spesso non e' vero - un 4x10
 * comodo stima un massimale piu' basso del vero. Per questo chi mostra il
 * numero deve mostrare anche da dove viene: e' l'unico modo che ha chi legge
 * per capire quanto crederci.
 */
export function oneRepMaxOf(sets: PerformedSet[]): OneRepMaxEstimate | null {
  const from = bestSet(sets);
  if (!from) return null;
  const value = Math.round(estimateOneRepMax(from.load, from.reps) * 2) / 2;
  return value > 0 ? { value, from } : null;
}
