import { InjectionToken } from '@angular/core';
import { vibra, Vibrazione } from './vibrazione.util';

/**
 * Il segnale di fine recupero: il telefono e' sulla panca o in tasca, e quello
 * che serve e' sentirlo. Su iPhone installato dalla Home la vibrazione del
 * browser non esiste (vedi vibrazione.util), e il suono e' l'unico canale che
 * resta: un tono breve, fatto col Web Audio invece di un file, cosi' non c'e'
 * niente da scaricare ne' da tenere in cache.
 *
 * Due preferenze, per dispositivo e non per account: il suono serve sul
 * telefono in palestra e magari non sul portatile a casa.
 */

export interface PreferenzeSegnale {
  suono: boolean;
  vibrazione: boolean;
}

export const PREFERENZE_SEGNALE_KEY = 'segnaleRecupero';

type Archivio = Pick<Storage, 'getItem' | 'setItem'>;

function archivioReale(): Archivio | null {
  // In una finestra privata il solo accesso a localStorage puo' lanciare.
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Entrambi accesi finche' non si dice altro: un cronometro da palestra suona. */
export function leggiPreferenze(archivio: Archivio | null = archivioReale()): PreferenzeSegnale {
  try {
    const grezzo = archivio?.getItem(PREFERENZE_SEGNALE_KEY);
    if (!grezzo) return { suono: true, vibrazione: true };
    const p = JSON.parse(grezzo);
    return {
      suono: typeof p?.suono === 'boolean' ? p.suono : true,
      vibrazione: typeof p?.vibrazione === 'boolean' ? p.vibrazione : true
    };
  } catch {
    return { suono: true, vibrazione: true };
  }
}

export function salvaPreferenze(p: PreferenzeSegnale, archivio: Archivio | null = archivioReale()): void {
  try { archivio?.setItem(PREFERENZE_SEGNALE_KEY, JSON.stringify(p)); } catch { /* resta quella in memoria */ }
}

// ---- Il suono ----

/** Quello che serve del Web Audio: gli spec lo sostituiscono con un finto. */
export interface OscillatoreLike {
  type: string;
  frequency: { setValueAtTime(valore: number, quando: number): unknown };
  connect(destinazione: unknown): unknown;
  start(quando?: number): void;
  stop(quando?: number): void;
}
export interface GuadagnoLike {
  gain: {
    setValueAtTime(valore: number, quando: number): unknown;
    linearRampToValueAtTime(valore: number, quando: number): unknown;
    exponentialRampToValueAtTime(valore: number, quando: number): unknown;
  };
  connect(destinazione: unknown): unknown;
}
export interface ContestoSuonoLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): OscillatoreLike;
  createGain(): GuadagnoLike;
  createBuffer(canali: number, lunghezza: number, frequenza: number): unknown;
  createBufferSource(): { buffer: unknown; connect(destinazione: unknown): unknown; start(quando?: number): void };
}

/** Il costruttore del contesto (null dove il browser non ha il Web Audio) e il contesto una volta creato. */
export interface AmbienteSuono {
  crea: (() => ContestoSuonoLike) | null;
  contesto: ContestoSuonoLike | null;
}

function costruttoreAudio(): (() => ContestoSuonoLike) | null {
  const g = globalThis as any;
  const Contesto = g.AudioContext ?? g.webkitAudioContext;
  return Contesto ? () => new Contesto() as ContestoSuonoLike : null;
}

let reale: AmbienteSuono | null = null;

/** Uno solo per l'app: il contesto sbloccato da un tocco deve essere lo stesso che poi suona. */
export function ambienteSuonoReale(): AmbienteSuono {
  return reale ??= { crea: costruttoreAudio(), contesto: null };
}

export const AMBIENTE_SUONO = new InjectionToken<AmbienteSuono>('ambiente-suono', {
  providedIn: 'root',
  factory: ambienteSuonoReale
});

/**
 * iOS (e Chrome) tengono il suono muto finche' non c'e' un gesto dell'utente:
 * il contesto si crea e si riprende dentro un tocco, e da li' in poi il timer
 * puo' suonare anche senza che nessuno stia toccando. Si richiama a ogni tocco:
 * se il contesto gira gia' non costa niente, se il sistema l'ha sospeso (app in
 * secondo piano, telefonata) lo riprende.
 */
export function sbloccaAudio(ambiente: AmbienteSuono = ambienteSuonoReale()): void {
  if (!ambiente.crea) return;
  try {
    if (!ambiente.contesto || ambiente.contesto.state === 'closed') {
      const c = ambiente.crea();
      ambiente.contesto = c;
      // Il trucco storico di iOS: un buffer vuoto fatto partire dentro il gesto.
      const sorgente = c.createBufferSource();
      sorgente.buffer = c.createBuffer(1, 1, 22050);
      sorgente.connect(c.destination);
      sorgente.start(0);
    }
    if (ambiente.contesto.state !== 'running') ambiente.contesto.resume().catch(() => {});
  } catch {
    ambiente.contesto = null;
  }
}

interface Nota { hz: number; dopo: number; durata: number }

/**
 * Fine recupero: due note che salgono (sol, do), riconoscibili tra la musica
 * della palestra e diverse da un avviso qualunque. Fine pausa: una nota sola,
 * perche' e' un avviso meno importante. La serie confermata non suona: succede
 * venti volte a seduta, e per quello basta il tocco.
 */
const NOTE: Partial<Record<Vibrazione, Nota[]>> = {
  'fine-recupero': [{ hz: 784, dopo: 0, durata: 0.14 }, { hz: 1047, dopo: 0.2, durata: 0.24 }],
  'fine-pausa': [{ hz: 659, dopo: 0, durata: 0.2 }]
};

/** Abbastanza per sentirsi sopra la musica, non abbastanza da far sobbalzare. */
const VOLUME = 0.3;
/** Il piu' basso che l'inviluppo esponenziale accetta: a zero la rampa non si puo' calcolare. */
const SILENZIO = 0.0001;

function suonaOra(c: ContestoSuonoLike, note: Nota[]): void {
  if (c.state !== 'running') return;
  const t0 = c.currentTime;
  for (const n of note) {
    const inizio = t0 + n.dopo;
    const osc = c.createOscillator();
    const guadagno = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.hz, inizio);
    // Attacco rapido e coda che si spegne: senza, l'inizio e la fine della
    // nota fanno "clic".
    guadagno.gain.setValueAtTime(SILENZIO, inizio);
    guadagno.gain.linearRampToValueAtTime(VOLUME, inizio + 0.015);
    guadagno.gain.exponentialRampToValueAtTime(SILENZIO, inizio + n.durata);
    osc.connect(guadagno);
    guadagno.connect(c.destination);
    osc.start(inizio);
    osc.stop(inizio + n.durata + 0.02);
  }
}

/** Mai sbloccato (nessun tocco ancora) o senza Web Audio: non succede niente, e non e' un errore. */
export function suona(tipo: Vibrazione, ambiente: AmbienteSuono = ambienteSuonoReale()): void {
  const note = NOTE[tipo];
  const c = ambiente.contesto;
  if (!note || !c) return;
  try {
    if (c.state === 'running') { suonaOra(c, note); return; }
    // Sospeso dal sistema: si prova a riprenderlo. Se il browser lo permette
    // la nota parte (un attimo in ritardo), altrimenti si resta zitti.
    c.resume().then(() => suonaOra(c, note)).catch(() => {});
  } catch { /* un suono mancato non deve fermare il timer */ }
}

// ---- La porta unica ----

/**
 * Il segnale con quello che l'utente ha scelto. E' l'unico punto da cui
 * partono vibrazione e suono: chi spegne il suono dalle Impostazioni deve
 * poter contare che non parta da nessun'altra parte.
 */
export function segnala(
  tipo: Vibrazione,
  opzioni: { preferenze?: PreferenzeSegnale; suono?: AmbienteSuono } = {}
): void {
  const p = opzioni.preferenze ?? leggiPreferenze();
  if (p.vibrazione) vibra(tipo);
  if (p.suono) suona(tipo, opzioni.suono);
}
