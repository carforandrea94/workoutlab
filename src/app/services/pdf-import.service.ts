import { Injectable } from '@angular/core';
// Build "legacy" (non quella di default 'pdfjs-dist'): il README della libreria
// e' esplicito, "for usage with older browsers/environments, without native
// support for the latest JavaScript features, please see the legacy/ folder".
// La build di default assume feature JS molto recenti; su Safari/iOS non
// aggiornatissimi questo causava un crash a runtime nel worker durante
// l'estrazione testo ("undefined is not a function"), non un problema del PDF
// ne' della logica di parsing (verificato: lo stesso identico file estrae il
// testo senza errori con questa stessa libreria).
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Day, Exercise, WeekPlan, ClusterSpec } from '../models/workout.model';
import { normalizeCluster } from '../core/utils/cluster.util';
import {
  Diet, DietPlan, NamedMeal, MealCombination, FoodItem, FoodCategory, SupplementItem,
  DEFAULT_MEAL_NAMES, newDietPlan, newNamedMeal, newCombination
} from '../models/diet.model';
// Worker servito dallo stesso dominio dell'app. Un worker caricato da un CDN esterno e'
// cross-origin e su Safari/iOS spesso fallisce in silenzio (nessun errore, nessuna
// risposta), lasciando l'estrazione bloccata a tempo indeterminato senza alcun feedback.
// Il file lo copia il build dal pacchetto installato (angular.json, "assets":
// node_modules/pdfjs-dist/legacy/build, la build "legacy" come l'import sopra), cosi'
// worker e libreria hanno sempre la stessa versione. Prima era una copia a mano in
// public/, rimasta alla 6.1.200 mentre la libreria era alla 6.4.299: pdf.js rifiuta
// la coppia ("The API version ... does not match the Worker version ...") e
// l'import da PDF non partiva. La versione nell'indirizzo fa il resto: dopo un
// aggiornamento il telefono non puo' tenersi in cache il worker vecchio.
pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;

const MEAL_KEYWORDS: Record<string, string> = {
  'colazione': 'Colazione',
  'spuntino': 'Spuntino',
  'spuntino mattutino': 'Spuntino',
  'pranzo': 'Pranzo',
  'merenda': 'Merenda',
  'spuntino pomeridiano': 'Merenda',
  'cena': 'Cena'
};

/** Il suffisso che fa di un'intestazione l'alternativa del pasto che nomina.
 *
 *  ALTERNATIV[AO] e non solo ALTERNATIVA: il PDF concorda il genere col nome del
 *  pasto - "COLAZIONE ALTERNATIVA 1" ma "PRANZO ALTERNATIVO 1" - e riconoscendo
 *  una forma sola meta' delle alternative non combaciava. Quelle finivano nel
 *  ramo delle intestazioni sconosciute e diventavano pasti a se': nella dieta
 *  del cliente compariva un pasto "PRANZO ALTERNATIVO 2" accanto al pranzo,
 *  invece di una voce nel menu delle combinazioni. */
const ALT_SUFFIX = String.raw`(?:\s+ALTERNATIV[AO]\s*(\d+))?`;

const headerRe = (base: string) => new RegExp(`^${base}${ALT_SUFFIX}$`, 'i');

/** Intestazioni pasto riconosciute nel template "Giorno ON/OFF" (nutrizionista),
 *  con l'eventuale numero dell'alternativa catturato nel gruppo 1. L'ordine conta:
 *  i nomi composti vanno prima del generico "Spuntino" per non essere troncati. */
const MEAL_HEADER_DEFS: { name: string; re: RegExp }[] = [
  { name: 'Spuntino Mattina', re: headerRe(String.raw`SPUNTINO\s+MATTINA`) },
  { name: 'Merenda', re: headerRe(String.raw`SPUNTINO\s+POMERIDIANO`) },
  { name: 'Colazione', re: headerRe('COLAZIONE') },
  { name: 'Pranzo', re: headerRe('PRANZO') },
  { name: 'Merenda', re: headerRe('MERENDA') },
  { name: 'Cena', re: headerRe('CENA') },
  { name: 'Spuntino', re: headerRe('SPUNTINO') }
];

/** La nota che il PDF stampa ACCANTO al titolo, in corpo piu' piccolo
 *  ("CENA ALTERNATIVA 1   Nota: aggiungi 6gr di essenziali"). L'estrazione del
 *  testo la appiattisce sulla stessa riga, e l'intestazione smetteva di
 *  combaciare: l'alternativa spariva e i suoi alimenti confluivano nella
 *  combinazione precedente, corrompendola in silenzio. Va staccata prima di
 *  riconoscere l'intestazione, e non buttata: e' roba che il coach ha scritto. */
const HEADER_NOTE_RE = /\s+((?:nota|n\.?\s?b\.?)\s*:.*)$/i;

/** Cosa rende un pasto una riga tutta maiuscola che non sta fra quelle note.
 *
 *  Senza questo filtro ci finiva dentro qualunque riga maiuscola corta e senza
 *  quantita', comprese le precisazioni che il PDF stampa SOTTO un alimento
 *  ("SENZA ZUCCHERI AGGIUNTI" sotto i cornflakes): diventavano pasti, e il
 *  cliente si trovava in elenco un pasto chiamato "SENZA ZUCCHERI AGGIUNTI".
 *  Nel PDF le due cose si distinguono per colonna e corpo del carattere, che
 *  pero' l'estrazione del testo butta via: resta il nome. */
const MEAL_WORD_RE = /\b(COLAZIONE|PRANZO|CENA|MERENDA|SPUNTINO|PASTO|BRUNCH|WORKOUT|ALLENAMENTO|NANNA)\b/i;

const GIORNO_HEADER_RE = /^GIORNO\s+(.+)$/i;
// Marcatore di continuazione a inizio pagina ("...Continua Cena" / "…Continua Day 2").
// Accetta sia i puntini di sospensione veri (U+2026, spesso inseriti da Word/InDesign)
// sia tre o piu' punti separati, in qualunque combinazione: molti PDF usano l'uno o l'altro.
const CONTINUA_RE = /^(?:\.{2,}|…+)\s*continua\b/i;
const ALTERNATIVE_MARKER_RE = /^alternative\s*:?\s*$/i;

/** Riga tipo "Farina d'avena 5 Cucchiai 50 g": cattura la quantita' in grammi/ml/l a fine riga. */
const GRAM_TAIL_RE = /(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\.?\s*$/i;

/** Separa dal testo prima dei grammi l'eventuale "misura" (es. "5 Cucchiai", "3/4 di Piatto",
 *  "1 Piatto e 1/4") dal nome dell'alimento. Se non trova una misura riconosciuta, non c'e' match.
 *
 *  Bicchiere e frutto mancavano: "Farina d'avena 1 Bicchiere 100 g" finiva con la
 *  misura incollata al nome ("Farina d'avena   1 Bicchiere"), spazi doppi compresi,
 *  invece che nella quantita' accanto ai grammi. */
const MISURA_RE = /^(.*?)\s+((?:\d+(?:[\/.,]\d+)?\s+)?(?:di\s+)?(?:cucchiai(?:ni|no|o)?|fett[ae]|piatt[oi]|panin[oi]|bicchier[ei]|frutt[oi])(?:\s+e\s+\d+(?:[\/.,]\d+)?)?)$/i;

const CARB_KEYWORDS = [
  'avena', 'riso', 'pasta', 'patate', 'pane', 'gallette', 'fette biscottate', 'crusca',
  'cornflakes', 'gnocchi', 'cous cous', 'fiocchi', 'tostato', 'segale', 'azzimo',
  'frutta fresca', 'farina'
];
const PROTEIN_KEYWORDS = [
  'pollo', 'tacchino', 'merluzzo', 'nasello', 'tonno', 'calamaro', 'seppia', 'gamberetti',
  'rombo', 'platessa', 'salmone', 'pesce spada', 'vitello', 'proteine isolate', 'proteine',
  'yogurt greco', 'bresaola', 'manzo', 'maiale', 'coniglio'
];
const FAT_KEYWORDS = [
  'burro', 'frutta secca', 'olio', 'parmigiano', 'semi di chia', 'formaggio', 'mandorle',
  'noci', 'avocado'
];

/** Categorizza un alimento per macro in base al nome. E' un aiuto best-effort:
 *  il coach puo' sempre correggere la categoria nel builder dopo l'import. */
function categorizeFood(name: string): FoodCategory | 'skip' {
  const n = name.toLowerCase();
  if (/verdur/.test(n)) return 'skip'; // niente slot dedicato a "verdure" nel modello: restano fuori, come nota generale
  if (/albume/.test(n)) return 'protein';
  if (/uova di gallina/.test(n)) return 'fat'; // uovo intero: nel modello a 3 macro va con i grassi
  if (PROTEIN_KEYWORDS.some(k => n.includes(k))) return 'protein';
  if (FAT_KEYWORDS.some(k => n.includes(k))) return 'fat';
  if (CARB_KEYWORDS.some(k => n.includes(k))) return 'carb';
  return 'carb'; // fallback: da rivedere nel builder
}

const DURATA_RE = /DURATA\s+(\d+)\s+SETTIMANE/i;
/**
 * "DAY 1 : PETTO-SPALLE-TRICIPITI REC TRA 60-90”", e anche senza il recupero:
 * "DAY 1 : ADDUTTORI-TRICIPITI-ADDOME-LAVORO AEROBICO RISCALDAMENTO 3’".
 *
 * Il recupero dichiarato nell'intestazione e' facoltativo perche' c'e' chi lo
 * scrive una volta per tutto il giorno e chi lo scrive su ogni esercizio
 * ("REC 1’", "REC 50”"). Nel secondo caso lo si ricava dagli esercizi, piu'
 * sotto: senza, il giorno resterebbe senza un recupero da proporre.
 *
 * Un altro coach scrive "GIORNO 1: PUSH", "GIORNO 2:PULL" (i due punti senza
 * spazio) e "GIORNO 3" da solo, senza nome: stessa intestazione, in italiano.
 * Prima non si riconosceva, e tutta la scheda finiva nel parser generico, che
 * non sa leggere "EX.N/Nome" con lo schema sulla riga sotto.
 */
const DAY_HEADER_RE = /^(?:DAY|GIORNO)\s*(\d+)\s*(?:[:\-–]\s*)?(.*?)(?:\s+REC\s+TRA\s+([\d\-]+)[”"″'’]*)?\s*$/i;
/** Il riscaldamento finisce in coda ai muscoli del giorno: non e' un muscolo. */
const RISCALDAMENTO_RE = /\s+RISCALDAMENTO\b.*$/i;
/**
 * "REC 1’" sono sessanta secondi, "REC 50”" sono cinquanta: l'apostrofo sono
 * minuti, il doppio apice secondi. Vale anche per "RECUPERO".
 */
const REC_RE = /\bREC(?:UPERO)?\.?\s*(\d+)\s*([”"″'’])?/i;
/** "12/15’ VELOCITÀ 5,5 KM": il lavoro aerobico si conta in minuti. */
const DURATA_MINUTI_RE = /^(\d+(?:\s*\/\s*\d+)?\s*[’'])/;
/** "6X15+12 PAUSA 5”": una serie spezzata in due blocchi con una pausa dentro. */
const PAUSA_RE = /\bPAUSA\s*(\d+)\s*[”"″]/i;
/** "EX.1/SPINTE MANUBRI PANCA PIANA": il nome puo' contenere altre "/" (es. "DIPS MACHINE/PARALLELE"). */
const EX_HEADER_RE = /^EX\.?\s*(\d+)\s*\/\s*(.+)$/i;
/** Coppie "SxR" isolate su una riga schema, es. "4X10 4X10 4X8 ... 5X6" o "2x8 1x20". */
const PAIR_RE = /(\d+)\s*[xX×]\s*(\d+)/g;
// Segnale di progressione "wave": lo schema a piu' coppie va letto come ciclo che si ripete
// sulle settimane, non sommato. Il fraseggio del coach varia ("...riprendi da 4X10 aumentando
// il carico", ma anche "...ricomincia dal ciclo 1", "ripeti dal ciclo", "torna al ciclo"):
// accettiamo tutte queste varianti (additivo, le frasi gia' riconosciute restano valide).
const WAVE_MARKER_RE = /riprendi|aumentando|ricomincia|ripeti\s+dal\s+ciclo|torna\s+al\s+ciclo/i;
/**
 * "3 4 4 5 3X 6-8": la progressione compatta di un esercizio a onda. Le serie
 * cambiano di settimana in settimana (3, 4, 4, 5) e le ripetizioni restano le
 * stesse (6-8); l'ultimo "3X" e' il punto da cui si riparte, cioe' il primo
 * valore ripetuto, come "RIPRENDI DA 4X10" nelle schede con le coppie scritte
 * per esteso. Le serie sono numeri separati da spazi, poi la X e le ripetizioni
 * (un numero o un intervallo), poi eventualmente una nota.
 */
const SERIE_PER_SETTIMANA_RE = /^(\d+(?:\s+\d+)+)\s*[xX×]\s*(\d+(?:\s*[-–\/]\s*\d+)?)(?:\s+(.*))?$/;
/** "4X10+ ULTIMA IN STRIP..." / "3X12/15 con fermo in basso di 2”": sets + descrittore reps + nota libera. */
const SINGLE_SCHEME_RE = /^(\d+)\s*[xX×]\s*(\S+)(?:\s+(.*))?$/;

/** Intestazione di blocco integrazione legato all'allenamento: "pre-workout: 30 minuti
 *  prima", "intra-workout", "post-workout:" - il testo dopo l'eventuale ":" e' ignorato,
 *  serve solo a riconoscere l'inizio del blocco. */
const SUPPLEMENT_SECTION_RE = /^(pre-workout|intra-workout|post-workout)\b/i;
/** Riga che continua la precedente (il PDF va a capo a meta' frase, non per una nuova
 *  voce): inizia con una congiunzione breve ("e", "ed", "o", "ma") o un'elisione
 *  ("d'acqua", "l'allenamento", ...). */
const SUPPLEMENT_CONTINUATION_RE = /^((e|ed|o|ma)\b|[a-z]')/i;
const SUPPLEMENT_MEAL_KEYWORDS: [string, RegExp][] = [
  ['Colazione', /colazione/i],
  ['Pranzo', /pranzo/i],
  ['Cena', /cena/i],
  ['Merenda', /merenda/i]
];
const SUPPLEMENT_SECTION_MEAL: Record<'pre' | 'intra' | 'post', string> = {
  pre: 'Merenda',
  intra: 'Intra-Workout',
  post: 'Cena'
};

/** Ordine di priorita' per assegnare il gruppo muscolare da nome esercizio: le parole chiave
 *  piu' specifiche (Core, Gambe, Bicipiti) vanno prima di quelle che si sovrappongono a nomi
 *  di macchinari/esercizi di altri gruppi (es. "LAT MACHINE" usata anche per esercizi di core). */
const MUSCLE_KEYWORDS: { muscle: string; keywords: string[] }[] = [
  { muscle: 'Core', keywords: ['CRUNCH', 'GINOCCHIA', 'GAMBE AL PETTO', 'FLESSIONI', 'BUSTO', 'ADDOMINALI', 'PLANK', 'FITBALL', 'INVERSI', 'CORE'] },
  { muscle: 'Gambe', keywords: ['SQUAT', 'LEG', 'AFFONDI', 'HIP THRUST', 'STACCO', 'CALF', 'GAMBE'] },
  { muscle: 'Bicipiti', keywords: ['CURL', 'BICIP'] },
  { muscle: 'Dorso', keywords: ['LAT MACHINE', 'LAT INVERSA', 'REMATORE', 'T BAR', 'PULLEY', 'PULLOVER', 'PULL DOWN', 'PULLDOWN', 'TRAZION', 'ROW', 'DORSO'] },
  { muscle: 'Spalle', keywords: ['ALZATE', 'SPALLE', 'DELT', 'MILITARY', 'TIRATE AL MENTO', 'LENTO AVANTI'] },
  { muscle: 'Tricipiti', keywords: ['FRENCH PRESS', 'PUSH DOWN', 'PUSHDOWN', 'TRICIP', 'DIPS', 'PARALLELE'] },
  { muscle: 'Petto', keywords: ['PANCA', 'SPINTE', 'CHEST', 'PETTO', 'PECTORAL', 'CROCI'] }
];

/** Categorizza l'esercizio per gruppo muscolare dal nome; se non trova nulla, prova con i
 *  gruppi muscolari del giorno (dal titolo "DAY N: Petto-Spalle-Tricipiti"). Best-effort:
 *  il coach corregge nel builder se necessario. */
function categorizeExerciseMuscle(name: string, dayMuscles: string[]): string {
  const n = name.toUpperCase();
  for (const { muscle, keywords } of MUSCLE_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return muscle;
  }
  for (const raw of dayMuscles) {
    const u = raw.toUpperCase();
    for (const { muscle, keywords } of MUSCLE_KEYWORDS) {
      if (u.includes(muscle.toUpperCase()) || keywords.some(k => u.includes(k))) return muscle;
    }
  }
  return 'Core';
}

/** "PETTO-SPALLE-TRICIPITI" -> "Petto-Spalle-Tricipiti": solo per una resa piu' leggibile,
 *  il testo originale (tutto maiuscolo) resta comunque nel PDF sorgente. */
function toTitleCase(label: string): string {
  return label.split('-').map(part => part.trim()).filter(Boolean)
    .map(part => part.charAt(0) + part.slice(1).toLowerCase())
    .join('-');
}

/** "12-10-8" con 3 set -> un valore diverso per set; altrimenti (range "10/12", bilaterale
 *  "12+12", isometria "2’", "MAX", ripetizione fissa "8"...) lo stesso descrittore per ogni set. */
/**
 * I secondi di recupero scritti in una riga di schema, o null se non ce ne
 * sono. L'apostrofo sono minuti ("REC 1’" = 60), il doppio apice secondi
 * ("REC 50”" = 50); senza simbolo si leggono come secondi, che e' come li
 * scrive chi non mette il segno.
 */
function secondiDiRecupero(line: string): number | null {
  const m = line.match(REC_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!isFinite(n) || n <= 0) return null;
  return /['’]/.test(m[2] ?? '') ? n * 60 : n;
}

function buildReps(sets: number, repsRaw: string): string[] {
  const parts = repsRaw.split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length === sets) return parts;
  return Array.from({ length: sets }, () => repsRaw);
}

function supplementMealsInText(text: string): string[] {
  return SUPPLEMENT_MEAL_KEYWORDS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** Righe fuori sezione: "NOME: descrizione" (il pasto si trova cercando le parole
 *  chiave nella descrizione), oppure senza ":" "NOME resto-descrizione" (es.
 *  "magnesio 400mg da assumere dopo cena", "bromelina assumere la dose consigliata a pranzo e cena"). */
function extractSupplementOutsideSection(blob: string): { name: string; qty: string } | null {
  const colonMatch = blob.match(/^([^:]{1,40}):\s*(.+)$/);
  if (colonMatch) return { name: colonMatch[1].trim(), qty: colonMatch[2].trim() };
  const fallback = blob.match(/^(\S+)\s+(.+)$/);
  if (fallback) return { name: fallback[1].trim(), qty: fallback[2].trim() };
  return null;
}

/** Righe dentro una sezione pre/post-workout: prova "QUANTITA' di NOME [da assumere...]"
 *  (es. "5 gr di creatina da assumere nel pasto"), poi "NOME QUANTITA'" (es. "arginina 3g"),
 *  poi il fallback generico "prima parola nome, resto quantita'" (es. "termogenico
 *  dosaggio consigliato"). */
function extractSupplementInSection(line: string): { name: string; qty: string } | null {
  const qtyFirst = line.match(/^(\d+[\d.,]*\s*\S{0,4})\s+di\s+(.+?)(?:\s+da\s+assumere\b.*)?$/i);
  if (qtyFirst) return { name: qtyFirst[2].trim(), qty: qtyFirst[1].trim() };
  const nameFirst = line.match(/^(.+?)\s+(\d+[\d.,]*\s*\S{0,4})$/);
  if (nameFirst) return { name: nameFirst[1].trim(), qty: nameFirst[2].trim() };
  const generic = line.match(/^(\S+)\s+(.+)$/);
  if (generic) return { name: generic[1].trim(), qty: generic[2].trim() };
  return null;
}

export interface ParsedSupplements {
  always: Record<string, SupplementItem[]>;
  onlyOn: Record<string, SupplementItem[]>;
}

@Injectable({ providedIn: 'root' })
export class PdfImportService {

  // NB temporanea: il messaggio d'errore che arriva all'utente su Safari/iOS
  // ("undefined is not a function (near '...i of t...')") non basta a capire
  // QUALE chiamata fallisce - ogni fase qui sotto e' avvolta separatamente e
  // rilancia con un prefisso identificativo, cosi' il prossimo errore mostrato
  // in UI dice esattamente dove si e' fermato invece di un generico crash.
  async extractText(file: File): Promise<string> {
    const buf = await file.arrayBuffer();

    let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
    try {
      pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    } catch (e: any) {
      throw new Error(`[extractText:getDocument] ${e?.message ?? e}`);
    }

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      let page: Awaited<ReturnType<typeof pdf.getPage>>;
      try {
        page = await pdf.getPage(i);
      } catch (e: any) {
        throw new Error(`[extractText:getPage:${i}] ${e?.message ?? e}`);
      }

      let content: Awaited<ReturnType<typeof page.getTextContent>>;
      try {
        content = await page.getTextContent();
      } catch (e: any) {
        throw new Error(`[extractText:getTextContent:${i}] ${e?.message ?? e}`);
      }

      // Ogni TextItem segnala se chiude una riga (hasEOL): senza questo, unire tutto
      // con uno spazio appiattirebbe l'intera pagina su un'unica riga, rendendo
      // impossibile qualunque parsing riga-per-riga (intestazioni, alimenti, ecc.).
      let pageText = '';
      try {
        for (const it of content.items as any[]) {
          pageText += it.str;
          pageText += it.hasEOL ? '\n' : ' ';
        }
      } catch (e: any) {
        throw new Error(`[extractText:items:${i}] ${e?.message ?? e}`);
      }
      pages.push(pageText);
    }
    return pages.join('\n');
  }

  /** Parser best-effort per il PDF di integrazione: ogni riga viene assegnata al/ai
   *  pasto/i che indica, con la quantita' scritta li' - nessun tentativo di dedurre se
   *  lo stesso integratore citato altrove sia "la stessa dose" (deciso col coach: la
   *  creatina di colazione e quella post-workout sono due dosi indipendenti). Una riga
   *  che non permette di individuare pasto+quantita' viene scartata silenziosamente. */
  parseSupplementText(text: string): ParsedSupplements {
    const lines = text.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    const always: Record<string, SupplementItem[]> = {};
    const onlyOn: Record<string, SupplementItem[]> = {};
    const push = (map: Record<string, SupplementItem[]>, meal: string, item: SupplementItem) => {
      if (!map[meal]) map[meal] = [];
      map[meal].push(item);
    };

    let section: 'pre' | 'intra' | 'post' | null = null;
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      const sectionMatch = line.match(SUPPLEMENT_SECTION_RE);
      if (sectionMatch) {
        const kind = sectionMatch[1].toLowerCase();
        section = kind.startsWith('pre') ? 'pre' : kind.startsWith('intra') ? 'intra' : 'post';
        i++;
        continue;
      }

      if (section === 'intra') {
        let blob = line;
        i++;
        while (i < lines.length && SUPPLEMENT_CONTINUATION_RE.test(lines[i])) {
          blob += ' ' + lines[i];
          i++;
        }
        push(onlyOn, 'Intra-Workout', { name: 'Intra-workout', qty: blob });
        section = null;
        continue;
      }

      if (section === 'pre' || section === 'post') {
        if (supplementMealsInText(line).length > 0) {
          section = null;
        } else {
          const extracted = extractSupplementInSection(line);
          if (extracted) push(onlyOn, SUPPLEMENT_SECTION_MEAL[section], extracted);
          i++;
          continue;
        }
      }

      let blob = line;
      i++;
      while (i < lines.length && SUPPLEMENT_CONTINUATION_RE.test(lines[i])) {
        blob += ' ' + lines[i];
        i++;
      }
      const extracted = extractSupplementOutsideSection(blob);
      if (extracted) {
        for (const meal of supplementMealsInText(extracted.qty)) {
          push(always, meal, { name: extracted.name, qty: extracted.qty });
        }
      }
    }

    return { always, onlyOn };
  }

  /**
   * Prova prima il parsing "a template" (schede con intestazioni "DAY N: Gruppo Muscolare
   * REC TRA X-Y", esercizi "EX.N/Nome" e schema serie/ripetizioni sulla riga seguente, anche
   * in progressione "wave" su piu' settimane). Se il testo non contiene nessuna intestazione
   * "DAY N", ripiega sul parsing generico (nome+schema sulla stessa riga).
   */
  parseWorkoutText(text: string): Day[] {
    const templateDays = this.parseWorkoutTemplate(text);
    if (templateDays && templateDays.length > 0) return templateDays;
    return this.parseWorkoutTextGeneric(text);
  }

  /** Numero di settimane del programma dichiarato nel PDF ("DURATA 8 SETTIMANE"); 8 di default. */
  detectProgramDurationWeeks(text: string): number {
    const m = text.match(DURATA_RE);
    return m ? parseInt(m[1], 10) : 8;
  }

  /**
   * Onda di carico a livello di protocollo (usata nella schermata "Onda di carico" e
   * nel riepilogo "Settimana X di N"): deriva la progressione piu' frequente tra gli
   * esercizi wave effettivamente trovati nel PDF, invece di uno schema fisso identico
   * per ogni settimana. Se il PDF non contiene esercizi wave (es. programma tutto a
   * schemi fissi, o parser generico di fallback), ripiega su un default 4x10.
   */
  detectProtocolWeekPlan(days: Day[], totalWeeks: number): WeekPlan[] {
    const waveWeekPlans = days
      .flatMap(d => d.ex)
      .filter(ex => ex.scheme === 'wave' && ex.weekPlan && ex.weekPlan.length > 0)
      .map(ex => ex.weekPlan!);

    if (waveWeekPlans.length === 0) {
      return Array.from({ length: totalWeeks }, () => ({ sets: 4, reps: 10 }));
    }

    const key = (wp: WeekPlan[]) => wp.map(w => `${w.sets}x${w.reps}`).join('|');
    const counts = new Map<string, { plan: WeekPlan[]; count: number }>();
    for (const wp of waveWeekPlans) {
      const k = key(wp);
      const entry = counts.get(k);
      if (entry) entry.count++;
      else counts.set(k, { plan: wp, count: 1 });
    }

    let best = waveWeekPlans[0];
    let bestCount = 0;
    for (const { plan, count } of counts.values()) {
      if (count > bestCount) { best = plan; bestCount = count; }
    }
    return best;
  }

  /** Parsing a template: "DAY N: Gruppo REC TRA X-Y", poi per ogni "EX.N/Nome" la riga
   *  successiva con lo schema serie/ripetizioni (semplice, a piu' segmenti o "wave"). */
  private parseWorkoutTemplate(text: string): Day[] | null {
    const totalWeeks = this.detectProgramDurationWeeks(text);
    const rawLines = text.split(/\n|\r/).map(l => l.trim()).filter(Boolean);

    const days: Day[] = [];
    let currentDay: Day | null = null;
    let currentDayMuscles: string[] = [];
    let pendingExercise: string | null = null;

    const finalizePending = () => {
      if (pendingExercise && currentDay) {
        currentDay.ex.push({
          name: pendingExercise,
          scheme: 'plain',
          sets: 3,
          muscle: categorizeExerciseMuscle(pendingExercise, currentDayMuscles),
          reps: ['12', '12', '12'],
          note: 'Schema serie/ripetizioni non trovato nel PDF: da completare nel builder.'
        });
      }
      pendingExercise = null;
    };

    for (const line of rawLines) {
      if (DURATA_RE.test(line)) continue;
      // Riga di continuazione tra pagine ("…Continua Day 2"): il contesto (giorno ed
      // esercizio in sospeso) resta invariato, NON e' una riga di schema serie/ripetizioni.
      // Va intercettata prima del ramo "if (pendingExercise)" che altrimenti la leggerebbe
      // come schema fasullo, perdendo lo schema reale che segue l'interruzione di pagina.
      if (CONTINUA_RE.test(line)) continue;

      const dayMatch = line.match(DAY_HEADER_RE);
      if (dayMatch) {
        const label = dayMatch[2].replace(RISCALDAMENTO_RE, '').trim();
        // "GIORNO 3" senza nome: il giorno si chiama come e' scritto.
        const dayLabel = label ? toTitleCase(label) : `Giorno ${dayMatch[1]}`;
        // Stesso fix del parser dieta: "DAY N: ..." e' anche l'intestazione ripetuta a
        // inizio di OGNI pagina, non solo a inizio sezione. Se e' lo stesso giorno gia' in
        // corso, e' un semplice ri-attraversamento di pagina: non va creato un secondo
        // giorno duplicato ne' interrotta la lista esercizi (si perderebbe l'esercizio in
        // sospeso e il suo schema, spezzati dall'interruzione di pagina).
        const existingDay = days.find(d => d.label === dayLabel);
        if (existingDay !== currentDay) {
          finalizePending();
          currentDayMuscles = label.split(/[-,/]/).map(s => s.trim()).filter(Boolean);
          const recDichiarato = dayMatch[3] ? `${dayMatch[3].trim()}"` : '';
          currentDay = existingDay ?? { id: `day${days.length + 1}`, label: dayLabel, rec: recDichiarato, ex: [] };
          if (!existingDay) days.push(currentDay);
        }
        continue;
      }

      if (!currentDay) continue; // testo prima del primo "DAY": es. "DURATA 8 SETTIMANE"

      const exMatch = line.match(EX_HEADER_RE);
      if (exMatch) {
        finalizePending();
        pendingExercise = exMatch[2].trim();
        continue;
      }

      if (pendingExercise) {
        // Il nome di un esercizio puo' finire a capo: "EX.2/CAMMINATA LATERALE
        // CON FASCIA (3 PASSI A SX E 3 PASSI A DX" e sotto "RESTANDO BASSA IN
        // POSIZIONE SQUAT = 1 MOVIMENTO)". Una riga di schema comincia sempre
        // con una cifra - "6X10 REC 50”", "12/15’ VELOCITÀ 5,5 KM" - una
        // continuazione del nome no. Prima la continuazione veniva letta come
        // schema (e non lo era), e lo schema vero, arrivando dopo, si perdeva.
        if (!/^\d/.test(line)) {
          pendingExercise = `${pendingExercise} ${line}`.replace(/\s+/g, ' ').trim();
          continue;
        }
        currentDay.ex.push(this.parseSchemeLine(line, pendingExercise, currentDayMuscles, totalWeeks));
        pendingExercise = null;
      }
      // altre righe fuori contesto (raro in questo formato) vengono ignorate
    }
    finalizePending();
    for (const day of days) {
      if (!day.rec) day.rec = this.recDagliEsercizi(day);
    }

    // Delle intestazioni senza nemmeno un "EX.N/Nome" sotto non sono una scheda a
    // template: "Giorno 1" e' anche l'intestazione di un testo con nome e schema
    // sulla stessa riga ("Panca piana 4x10"), che sa leggere il parser generico.
    return days.some(d => d.ex.length > 0) ? days : null;
  }

  /**
   * Il recupero del giorno, quando l'intestazione non lo dichiara: si prende
   * quello scritto sugli esercizi ("REC 1’", "REC 50”") e si tiene il piu'
   * frequente. E' un default - nell'app si cambia per esercizio - e il
   * numero piu' ricorrente e' quello che fa sbagliare meno volte.
   *
   * Nessuno scritto, nessun default: resta vuoto, e l'app usa i suoi 90".
   */
  private recDagliEsercizi(day: Day): string {
    const conteggi = new Map<number, number>();
    for (const ex of day.ex) {
      const sec = secondiDiRecupero(ex.text ?? '');
      if (sec !== null) conteggi.set(sec, (conteggi.get(sec) ?? 0) + 1);
    }
    let scelto: number | null = null;
    let piuVisto = 0;
    for (const [sec, n] of conteggi) {
      if (n > piuVisto) { scelto = sec; piuVisto = n; }
    }
    return scelto === null ? '' : `${scelto}"`;
  }

  /** Interpreta la riga di schema subito sotto "EX.N/Nome": puo' essere una progressione
   *  "wave" su piu' settimane, uno schema a piu' segmenti (es. "2x8 1x20"), o uno schema
   *  semplice "SxR" con eventuale nota libera finale (es. drop-set, tempo di recupero). */
  private parseSchemeLine(line: string, name: string, dayMuscles: string[], totalWeeks: number): Exercise {
    const muscle = categorizeExerciseMuscle(name, dayMuscles);
    const pairs = Array.from(line.matchAll(PAIR_RE)).map(m => ({ sets: parseInt(m[1], 10), reps: parseInt(m[2], 10) }));

    // "6X15+12 PAUSA 5”": una serie spezzata in due, con una pausa dentro.
    // L'app i cluster li sa fare - blocchi, pausa che scorre, riassunto - ma
    // solo se glielo si dice qui: senza, "15+12" finisce nelle ripetizioni
    // come testo, e una ruota che deve mostrare un numero ci legge 15.
    const cluster = this.clusterDaRiga(line);
    if (cluster) {
      return {
        name, scheme: 'plain', sets: cluster.sets, muscle,
        reps: Array.from({ length: cluster.sets }, () => cluster.spec.blocks.join('+')),
        cluster: cluster.spec,
        note: cluster.nota,
        text: line
      };
    }

    const perSettimana = line.match(SERIE_PER_SETTIMANA_RE);
    if (perSettimana) {
      const numeri = perSettimana[1].split(/\s+/).map(n => parseInt(n, 10));
      // L'ultimo numero uguale al primo e' il punto di ripresa, non una settimana in piu'.
      const ciclo = numeri.length >= 3 && numeri[numeri.length - 1] === numeri[0] ? numeri.slice(0, -1) : numeri;
      const repsScritte = perSettimana[2].replace(/\s+/g, '').replace('–', '-');
      const reps: number | string = /^\d+$/.test(repsScritte) ? parseInt(repsScritte, 10) : repsScritte;
      const weekPlan: WeekPlan[] = Array.from({ length: totalWeeks }, (_, i) => ({ sets: ciclo[i % ciclo.length], reps }));
      return {
        name, scheme: 'wave', sets: weekPlan[0].sets, muscle,
        reps: [String(reps)], weekPlan, note: perSettimana[3]?.trim() || undefined, text: line
      };
    }

    if (pairs.length >= 2 && WAVE_MARKER_RE.test(line)) {
      const weekPlan: WeekPlan[] = Array.from({ length: totalWeeks }, (_, i) => pairs[i % pairs.length]);
      return {
        name, scheme: 'wave', sets: weekPlan[0].sets, muscle,
        reps: [String(weekPlan[0].reps)], weekPlan, text: line
      };
    }

    if (pairs.length >= 2) {
      const sets = pairs.reduce((acc, p) => acc + p.sets, 0);
      const reps = pairs.flatMap(p => Array.from({ length: p.sets }, () => String(p.reps)));
      return { name, scheme: 'plain', sets, muscle, reps, text: line };
    }

    // "12/15’ VELOCITÀ 5,5 KM", "7/8’ MAX VELOCITÀ 5 KM": il tappeto non si
    // conta in serie per ripetizioni, si conta in minuti. Scriverlo come
    // "schema non riconosciuto" con un 3x12 inventato sotto sarebbe peggio
    // che non scriverlo: quel 3x12 nessuno l'ha mai chiesto.
    const durata = line.match(DURATA_MINUTI_RE);
    if (durata && pairs.length === 0) {
      const resto = line.slice(durata[0].length).trim();
      return {
        name, scheme: 'plain', sets: 1, muscle,
        reps: [durata[1]], note: resto || undefined, text: line
      };
    }

    const single = line.match(SINGLE_SCHEME_RE);
    if (single) {
      const sets = parseInt(single[1], 10) || 1;
      let repsRaw = single[2];
      let note = single[3]?.trim() || undefined;
      // Un descrittore reps NON numerico e' una frase di piu' parole (es. "AL CEDIMENTO"):
      // SINGLE_SCHEME_RE ne cattura solo la prima parola in reps e spinge il resto nella nota,
      // spezzando "AL CEDIMENTO" in reps="AL" + nota="CEDIMENTO". Se le reps non contengono
      // cifre, la "nota" fa in realta' parte delle reps: la riuniamo. Quando invece le reps
      // sono numeriche ("10+", "12/15", "2'") la nota resta separata (drop-set, tempo di recupero).
      if (note && !/\d/.test(repsRaw)) {
        repsRaw = `${repsRaw} ${note}`;
        note = undefined;
      }
      if (repsRaw.endsWith('+')) repsRaw = repsRaw.slice(0, -1); // "10+" = nota a seguire, non bilaterale ("12+12")
      return { name, scheme: 'plain', sets, muscle, reps: buildReps(sets, repsRaw), note, text: line };
    }

    return {
      name, scheme: 'plain', sets: 3, muscle, reps: ['12', '12', '12'],
      note: `Schema non riconosciuto nel PDF ("${line}"): da rivedere nel builder.`, text: line
    };
  }

  /**
   * Una serie a cluster letta dalla riga: "6X15+12 PAUSA 5”" sono sei serie
   * fatte di 15 ripetizioni, cinque secondi di pausa, altre 12.
   *
   * Si riconosce solo quando la pausa c'e' scritta, coi suoi secondi. Un
   * "12+10" senza pausa puo' essere un cluster come un doppio carico o uno
   * stripping, e inventargliela vorrebbe dire far partire un conto alla
   * rovescia che il coach non ha mai chiesto.
   *
   * Il resto della riga ("E RIPARTI CON LO STESSO GLUTEO PER LE 12") resta
   * come nota: e' un'istruzione per chi si allena, e il parser non deve
   * provare a capirla.
   */
  private clusterDaRiga(line: string): { sets: number; spec: ClusterSpec; nota?: string } | null {
    const pausa = line.match(PAUSA_RE);
    if (!pausa) return null;
    const m = line.match(/^(\d+)\s*[xX×]\s*(\d+)\s*\+\s*(\d+)/);
    if (!m) return null;

    const spec = normalizeCluster({
      blocks: [parseInt(m[2], 10), parseInt(m[3], 10)],
      restSec: parseInt(pausa[1], 10),
      end: 'fixed'
    });
    if (!spec) return null;

    const nota = line.slice(pausa.index! + pausa[0].length).trim();
    return { sets: parseInt(m[1], 10), spec, nota: nota || undefined };
  }

  /**
   * Parsing euristico generico (fallback): riconosce righe tipo "Nome esercizio 4x10" o
   * "Nome esercizio 3x12-10-8" (nome e schema sulla stessa riga). Le righe che sembrano
   * titoli (poche parole, senza numeri) diventano l'inizio di un nuovo giorno. Usato quando
   * il testo non corrisponde al template "DAY N / EX.N".
   */
  private parseWorkoutTextGeneric(text: string): Day[] {
    const rawLines = text.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    const exRegex = /^(.{2,60}?)\s+(\d+)\s*[x×]\s*([\d\-\/,\s]+)$/i;
    const dayHeaderRegex = /^(giorno|day)\s*\d*[:\-]?\s*(.*)$/i;

    const days: Day[] = [];
    let current: Day | null = null;
    let dayCount = 0;

    const newDay = (label: string) => {
      dayCount++;
      const d: Day = { id: `day${dayCount}`, label: label || `Giorno ${dayCount}`, rec: '60-90"', ex: [] };
      days.push(d);
      current = d;
    };

    for (const line of rawLines) {
      const headerMatch = line.match(dayHeaderRegex);
      if (headerMatch) {
        newDay(headerMatch[2] || line);
        continue;
      }

      const exMatch = line.match(exRegex);
      if (exMatch) {
        if (!current) newDay('Giorno 1');
        const [, name, setsStr, repsStr] = exMatch;
        const sets = parseInt(setsStr, 10) || 1;
        const reps = repsStr.split(/[-\/,]/).map(r => r.trim()).filter(Boolean);
        const ex: Exercise = {
          name: name.trim(),
          scheme: 'plain',
          sets,
          muscle: 'Core',
          text: `${sets}x${repsStr.trim()}`,
          reps: reps.length === sets ? reps : Array.from({ length: sets }, (_, i) => reps[i] ?? reps[0] ?? '')
        };
        current!.ex.push(ex);
      }
    }

    return days;
  }

  /**
   * Prova prima il parsing "a template" (piani "Giorno ON/OFF" con pasti a combinazioni
   * Base + Alternativa, come nei PDF generati da software di nutrizione standard). Se il
   * testo non contiene nessuna intestazione "Giorno ...", ripiega sul parsing generico
   * (un solo piano, un pasto per intestazione nota, nessuna combinazione/alternativa).
   */
  parseDietText(text: string): Diet {
    const templatePlans = this.parseDietTemplate(text);
    if (templatePlans && templatePlans.length > 0) return templatePlans;
    return this.parseDietTextGeneric(text);
  }

  /**
   * Estrae dal PDF dieta le informazioni che non rientrano nel modello a 3 macro per
   * combinazione (verdure fresche, "Consigli di base"), da usare come nota libera del
   * protocollo (infoNote). Ritorna stringa vuota se non trova nulla di utile.
   */
  extractDietNotes(text: string): string {
    const lines = text.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    const notes: string[] = [];

    const verdureSeen = new Set<string>();
    const verdureRe = /^verdure fresche.*?(\d+(?:[.,]\d+)?\s*g)/i;
    for (const line of lines) {
      const m = line.match(verdureRe);
      if (m) verdureSeen.add(m[1].replace(/\s+/g, ' '));
    }
    if (verdureSeen.size > 0) {
      notes.push(`Verdure fresche libere ad ogni pasto principale (quantità indicativa dal PDF: ${Array.from(verdureSeen).join(' / ')}).`);
    }

    const idx = lines.findIndex(l => /^consigli di base$/i.test(l));
    if (idx >= 0) {
      const tips: string[] = [];
      for (const line of lines.slice(idx + 1)) {
        // Chiusura esplicita della sezione "Consigli di base": senza un limite, consumava
        // ogni riga fino a fine documento, trascinando dentro i consigli anche il contenuto
        // delle sezioni successive (un altro "Giorno X", un pasto, una pagina "...Continua").
        if (
          CONTINUA_RE.test(line) ||
          GIORNO_HEADER_RE.test(line) ||
          MEAL_HEADER_DEFS.some(d => d.re.test(line))
        ) break;
        if (/^consigli di base$/i.test(line)) continue; // intestazione ripetuta su piu' pagine
        if (/^dott\.?\s/i.test(line)) continue;
        if (/^\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
        if (/^pagina\s+\d+\s+di\s+\d+$/i.test(line)) continue;
        tips.push(line);
      }
      if (tips.length > 0) notes.push('Consigli di base:\n' + tips.map(t => `- ${t}`).join('\n'));
    }

    return notes.join('\n\n');
  }

  /** Parsing a template: piani "Giorno X", pasti con combinazioni Base + Alternativa N. */
  private parseDietTemplate(text: string): Diet | null {
    // Alcuni PDF uniscono l'alimento e il marcatore "Alternative:" sulla stessa riga
    // (es. "Petto di pollo 200 g Alternative:"): isolo sempre il marcatore su una riga
    // propria, indipendentemente da come pdf.js ha ricostruito gli a-capo.
    const cleaned = text
      .replace(/Olio di oli\s+(\d+(?:[.,]\d+)?\s*g)\s+va\s*\(media\)/gi, 'Olio di oliva (media) $1')
      .replace(/\s*Alternative\s*:\s*/gi, '\nAlternative:\n');

    const rawLines = cleaned.split(/\n|\r/).map(l => l.trim()).filter(Boolean);

    const plans: DietPlan[] = [];
    let currentPlan: DietPlan | null = null;
    let currentMeal: NamedMeal | null = null;
    let currentCombo: MealCombination | null = null;
    let lastItem: FoodItem | null = null;
    let collectingAlt = false;

    const findOrCreateMeal = (plan: DietPlan, name: string): NamedMeal => {
      let meal = plan.meals.find(m => m.name === name);
      if (!meal) {
        meal = newNamedMeal(name);
        meal.combinations = []; // costruiamo noi le combinazioni via via, non partiamo dalla 'Base' vuota di default
        plan.meals.push(meal);
      }
      return meal;
    };

    for (const line of rawLines) {
      const giornoMatch = line.match(GIORNO_HEADER_RE);
      if (giornoMatch) {
        const planName = `Giorno ${giornoMatch[1].trim()}`;
        const existingPlan = plans.find(p => p.name === planName);
        // "Giorno ON/OFF" e' anche l'intestazione ripetuta su ogni pagina del PDF, non solo
        // l'inizio della sezione: se e' lo stesso piano gia' in corso, e' un semplice
        // ri-attraversamento (come "...Continua X") e NON deve azzerare pasto/combinazione/
        // alternative correnti, altrimenti si perde tutto cio' che segue un'interruzione di
        // pagina a meta' di un pasto (es. alternative o alimenti dopo "...Continua Cena").
        if (existingPlan !== currentPlan) {
          currentPlan = existingPlan ?? newDietPlan(planName);
          if (!existingPlan) {
            currentPlan.meals = [];
            plans.push(currentPlan);
          }
          currentMeal = null;
          currentCombo = null;
          lastItem = null;
          collectingAlt = false;
        }
        continue;
      }

      if (CONTINUA_RE.test(line)) continue; // riga di continuazione tra pagine: il contesto resta invariato

      if (currentPlan) {
        // La nota accanto al titolo va tolta prima del riconoscimento, o l'ancora
        // di fine riga non combacia; il titolo pulito serve anche al ramo delle
        // intestazioni sconosciute, piu' sotto.
        const notaMatch = line.match(HEADER_NOTE_RE);
        const testa = notaMatch ? line.slice(0, notaMatch.index).trim() : line;
        const nota = notaMatch ? notaMatch[1].trim() : '';

        const mealHeader = MEAL_HEADER_DEFS.find(d => d.re.test(testa));
        if (mealHeader) {
          const m = testa.match(mealHeader.re)!;
          const altNum = m[1];
          const meal = findOrCreateMeal(currentPlan, mealHeader.name);
          currentMeal = meal;
          if (altNum) {
            // La nota entra nell'etichetta: e' li' che il cliente sceglie la
            // combinazione, ed e' l'unico posto dove puo' leggerla.
            const combo = newCombination(nota ? `Alternativa ${altNum} · ${nota}` : `Alternativa ${altNum}`);
            meal.combinations.push(combo);
            currentCombo = combo;
          } else {
            if (meal.combinations.length === 0) meal.combinations.push(newCombination('Base'));
            currentCombo = meal.combinations[0];
          }
          lastItem = null;
          collectingAlt = false;
          continue;
        }

        // Riga tutta in maiuscolo, corta e senza quantita' in grammi: nel PDF
        // sono due cose diverse, e il testo estratto non le distingue piu'.
        if (
          !ALTERNATIVE_MARKER_RE.test(testa) &&
          !GRAM_TAIL_RE.test(testa) &&
          testa === testa.toUpperCase() &&
          /[A-ZÀ-Ù]/.test(testa) &&
          testa.split(/\s+/).length <= 5
        ) {
          // Se nomina un pasto e' un'intestazione che MEAL_HEADER_DEFS non
          // prevede (es. "SPUNTINO SERALE"): la apriamo come pasto a se' invece
          // di lasciar cadere la riga e far confluire i suoi alimenti nel pasto
          // precedente, corrompendolo.
          if (MEAL_WORD_RE.test(testa)) {
            const meal = findOrCreateMeal(currentPlan, testa);
            currentMeal = meal;
            if (meal.combinations.length === 0) meal.combinations.push(newCombination('Base'));
            currentCombo = meal.combinations[0];
            lastItem = null;
            collectingAlt = false;
            continue;
          }

          // Se non nomina nessun pasto e' una precisazione sull'alimento sopra,
          // che il PDF stampa su una riga sua ("SENZA ZUCCHERI AGGIUNTI" sotto i
          // cornflakes): fa parte del nome di quell'alimento, non e' un pasto.
          if (lastItem) {
            lastItem.name = `${lastItem.name} ${testa.toLowerCase()}`;
            continue;
          }
          // Niente a cui attaccarla e nessun pasto da aprire: si lascia cadere.
          continue;
        }
      }

      if (ALTERNATIVE_MARKER_RE.test(line)) {
        collectingAlt = !!lastItem;
        continue;
      }

      if (!currentCombo) continue; // testo fuori contesto: dati anagrafici, intestazioni pagina, consigli finali

      const gramMatch = line.match(GRAM_TAIL_RE);
      if (!gramMatch || gramMatch.index === undefined) continue; // prosa non riconosciuta (sottotitoli, note extra)

      const gramPart = gramMatch[0].trim();
      const headPart = line.slice(0, gramMatch.index).trim();
      if (!headPart) continue;

      const misuraMatch = headPart.match(MISURA_RE);
      const name = (misuraMatch ? misuraMatch[1] : headPart).trim();
      const qty = misuraMatch ? `${misuraMatch[2]} · ${gramPart}` : gramPart;
      if (!name) continue;

      const cat = categorizeFood(name);
      if (cat === 'skip') continue; // verdure ecc.: mai nel modello, ne' come base ne' come alternativa

      // Le alternative preservano sempre la stessa macro dell'alimento a cui si riferiscono
      // (e' la logica delle liste di scambio): se la categoria cambia, non e' un'alternativa
      // ma il prossimo alimento della combinazione.
      if (collectingAlt && lastItem && lastItem.category === cat) {
        if (!lastItem.alt) lastItem.alt = [];
        lastItem.alt.push({ name, qty });
        continue;
      }
      collectingAlt = false;

      if (currentCombo[cat]) {
        // macro gia' occupata in questa combinazione: aggiungo come alternativa
        // dell'alimento presente invece di perdere il dato.
        const existing: FoodItem = currentCombo[cat]!;
        if (!existing.alt) existing.alt = [];
        existing.alt.push({ name, qty });
        lastItem = existing;
      } else {
        const food: FoodItem = { name, qty, category: cat };
        currentCombo[cat] = food;
        lastItem = food;
      }
    }

    return plans.length > 0 ? plans : null;
  }

  /**
   * Parsing euristico generico (fallback): un solo piano, intestazioni pasto note
   * (Colazione/Pranzo/Cena/ecc.), niente combinazioni/alternative. Usato quando il
   * testo non corrisponde al template "Giorno ON/OFF".
   */
  private parseDietTextGeneric(text: string): Diet {
    const plan = newDietPlan('Dieta (da PDF)');
    plan.meals = []; // ripartiamo da zero, aggiungiamo solo i pasti che troviamo davvero nel testo

    const rawLines = text.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
    const qtyRegex = /^(.+?)\s+([\d.,]+\s?(?:g|kg|ml|l|cucchiai|cucchiaino|fette|pz|uova)\.?)$/i;

    let currentMealName: string | null = null;

    for (const line of rawLines) {
      const lower = line.toLowerCase().replace(/[:：]/g, '').trim();
      const mealMatch = Object.keys(MEAL_KEYWORDS).find(k => lower === k || lower.startsWith(k + ' '));
      if (mealMatch) {
        currentMealName = MEAL_KEYWORDS[mealMatch];
        if (!plan.meals.some(m => m.name === currentMealName)) {
          plan.meals.push(newNamedMeal(currentMealName));
        }
        continue;
      }
      if (!currentMealName) continue;

      const meal = plan.meals.find(m => m.name === currentMealName)!;
      const base = meal.combinations[0];

      const m = line.match(qtyRegex);
      const food = m
        ? { name: m[1].trim(), qty: m[2].trim() as string, category: 'carb' as const }
        : (line.length > 1 && line.length < 80 ? { name: line, qty: '', category: 'carb' as const } : null);
      if (!food) continue;

      // Non potendo dedurre la macro dal solo testo, il primo alimento del pasto
      // va nella combinazione base (categoria da rivedere nel builder), gli altri
      // finiscono tra le alternative: il coach riorganizza tutto nel builder.
      if (!base.carb) {
        base.carb = food;
      } else {
        meal.alternatives.carb.push(food);
      }
    }

    // Se non e' stato riconosciuto nessun pasto, torna comunque i 5 standard vuoti
    if (plan.meals.length === 0) {
      plan.meals = DEFAULT_MEAL_NAMES.map(name => newNamedMeal(name));
    }

    return [plan];
  }
}
