import { Sex } from '../models/user.model';
import { dividiNome, componiNome } from './nome.util';
import { HEIGHT_MIN_CM, HEIGHT_MAX_CM } from './height.util';

/**
 * I dati dell'account che l'app vuole avere: nome e cognome, data di nascita,
 * sesso e altezza. Gli ultimi tre sono l'ingresso delle formule di
 * composizione corporea (Misure), che senza eta' e sesso non funzionano.
 */
export type CampoProfilo = 'nome' | 'cognome' | 'birthDate' | 'sex' | 'heightCm';

/** La forma minima di un profilo che serve qui: lo stesso UserProfile, ma anche una sua parte. */
export interface DatiProfilo {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  sex?: Sex | null;
  heightCm?: number | null;
}

/**
 * Quali dati mancano. Nome e cognome si leggono come li legge il resto
 * dell'app (dividiNome): un profilo nato con il solo nome intero ha il cognome
 * dentro displayName, e non e' un dato che manca.
 */
export function campiMancanti(profilo: DatiProfilo): CampoProfilo[] {
  const { nome, cognome } = dividiNome(profilo);
  const mancanti: CampoProfilo[] = [];
  if (!nome) mancanti.push('nome');
  if (!cognome) mancanti.push('cognome');
  if (!profilo.birthDate) mancanti.push('birthDate');
  if (profilo.sex !== 'm' && profilo.sex !== 'f') mancanti.push('sex');
  if (profilo.heightCm === null || profilo.heightCm === undefined) mancanti.push('heightCm');
  return mancanti;
}

export function profiloCompleto(profilo: DatiProfilo): boolean {
  return campiMancanti(profilo).length === 0;
}

/** Nessuno nasce domani, e prima di questo limite nessun vivente: serve a chiudere il campo data. */
export const NASCITA_MIN = '1920-01-01';

/** Quello che l'utente scrive nella schermata, prima di ogni conversione. */
export interface InputProfilo {
  nome: string;
  cognome: string;
  birthDate: string;
  sex: Sex | null;
  heightCm: number | string | null;
}

export type ErroriProfilo = Partial<Record<CampoProfilo, string>>;

/** yyyy-mm-dd che esiste davvero sul calendario (il 31 febbraio no). */
function dataEsiste(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

/**
 * Controlla quello che l'utente ha scritto, con gli stessi limiti delle regole
 * di Firestore (lunghezze, altezza fra 100 e 250 cm, data nel formato giusto):
 * dirlo qui evita di far tornare un permesso negato.
 *
 * @param oggi ISO yyyy-mm-dd, passato da fuori per poterlo provare.
 */
export function validaProfilo(input: InputProfilo, oggi: string): ErroriProfilo {
  const errori: ErroriProfilo = {};

  const nome = input.nome.trim();
  const cognome = input.cognome.trim();
  if (!nome) errori.nome = 'Il nome è obbligatorio.';
  else if (nome.length > 80) errori.nome = 'Il nome è troppo lungo.';
  if (!cognome) errori.cognome = 'Il cognome è obbligatorio.';
  else if (cognome.length > 80) errori.cognome = 'Il cognome è troppo lungo.';
  // Il nome intero e' un campo solo, e le regole lo tengono sotto gli 80.
  if (!errori.nome && !errori.cognome && componiNome(nome, cognome).length > 80) {
    errori.cognome = 'Nome e cognome insieme sono troppo lunghi.';
  }

  if (!input.birthDate) {
    errori.birthDate = 'La data di nascita è obbligatoria.';
  } else if (!dataEsiste(input.birthDate) || input.birthDate < NASCITA_MIN || input.birthDate > oggi) {
    errori.birthDate = 'La data di nascita non è valida.';
  }

  if (input.sex !== 'm' && input.sex !== 'f') errori.sex = 'Scegli un\'opzione.';

  const altezza = input.heightCm === '' || input.heightCm === null ? NaN : Number(input.heightCm);
  if (input.heightCm === '' || input.heightCm === null || !isFinite(altezza)) {
    errori.heightCm = 'L\'altezza è obbligatoria.';
  } else if (altezza < HEIGHT_MIN_CM || altezza > HEIGHT_MAX_CM) {
    errori.heightCm = `L'altezza deve stare fra ${HEIGHT_MIN_CM} e ${HEIGHT_MAX_CM} cm.`;
  }

  return errori;
}
