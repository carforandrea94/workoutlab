/**
 * Nome e cognome, su profili che per molto tempo hanno avuto solo un campo.
 *
 * L'iscrizione chiede "Il tuo nome" e basta, e tutto quello che mostra una
 * persona nell'app - la testata dell'Account, il sottotitolo della navbar, la
 * lista clienti del coach - legge quel campo unico. Separarli senza rompere
 * nessuno di quei punti vuol dire tenere i tre valori allineati: nome e
 * cognome sono la verita', displayName e' la loro somma, riscritta a ogni
 * salvataggio.
 */

export interface NomeDiviso {
  nome: string;
  cognome: string;
}

/**
 * Cosa mostrare nei due campi.
 *
 * Se il profilo i due campi ce li ha, sono quelli. Se non li ha - ed e' il
 * caso di ogni account nato prima - si spezza il nome intero al PRIMO spazio:
 * "Andrea Carfora" da' Andrea e Carfora, "Anna Maria Rossi" da' Anna e
 * "Maria Rossi". E' un'ipotesi, non una regola, ma e' solo un riempimento:
 * chi apre la schermata vede subito com'e' finita e la corregge.
 */
export function dividiNome(profilo: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): NomeDiviso {
  if (profilo.firstName != null || profilo.lastName != null) {
    return { nome: (profilo.firstName ?? '').trim(), cognome: (profilo.lastName ?? '').trim() };
  }

  const intero = (profilo.displayName ?? '').trim().replace(/\s+/g, ' ');
  if (!intero) return { nome: '', cognome: '' };

  const spazio = intero.indexOf(' ');
  return spazio === -1
    ? { nome: intero, cognome: '' }
    : { nome: intero.slice(0, spazio), cognome: intero.slice(spazio + 1) };
}

/**
 * Il nome intero da mostrare, cioe' quello che finisce in displayName.
 *
 * Con il cognome vuoto resta il solo nome, senza lo spazio appeso in fondo:
 * quello spazio finirebbe nell'iniziale dell'avatar e nella lista del coach.
 */
export function componiNome(nome: string, cognome: string): string {
  return [nome.trim(), cognome.trim()].filter(Boolean).join(' ');
}
