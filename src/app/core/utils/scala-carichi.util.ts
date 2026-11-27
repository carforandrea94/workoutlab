/**
 * La scala del massimale: i pesi del foglio messi su una riga dall'80 al 100%,
 * cosi' si vede che 107 sta sotto 112 che sta sotto 114,7 senza leggere quattro
 * percentuali una dopo l'altra. Il disegno lo fa il componente; qui le
 * posizioni e da che parte va ogni etichetta.
 */

export interface PuntoScala {
  chiave: string;
  kg: number;
  percento: number;
  /** E' il peso che c'e' nella ruota. */
  scelto: boolean;
}

export interface PuntoDisegnato {
  chiave: string;
  /** Il peso scritto come si scrive qui: "112,2". */
  testo: string;
  /** Posizione sulla riga, 0-100. */
  x: number;
  /** L'etichetta sta sotto la riga invece che sopra. */
  sotto: boolean;
  scelto: boolean;
}

export interface Scala {
  /** Dove comincia la riga, in percentuale del massimale: 80, o meno se un peso sta piu' in basso. */
  inizio: number;
  punti: PuntoDisegnato[];
  /** Fra questi due x la riga e' piena: dal peso piu' leggero al piu' pesante. */
  da: number;
  a: number;
}

/** Quanto spazio (su 100) vuole un'etichetta: due vicine si disegnano una sopra e una sotto. */
const SPAZIO_ETICHETTA = 16;

const kgIt = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });

/**
 * La scala per questi pesi, o null se non c'e' niente da mettere in scala (meno
 * di due pesi con una percentuale: da solo, un peso non ha un "rispetto a").
 */
export function disegnaScala(punti: readonly PuntoScala[]): Scala | null {
  const validi = punti.filter(p => isFinite(p.percento) && isFinite(p.kg));
  if (validi.length < 2) return null;
  const ordinati = [...validi].sort((a, b) => a.percento - b.percento);

  // Dall'80%, o da un gradino di cinque sotto il peso piu' leggero: la riga non si sprofonda per un peso solo.
  const inizio = Math.max(0, Math.min(80, Math.floor(ordinati[0].percento / 5) * 5));
  // Al centesimo: 55,00000000000001 non e' una posizione, e un test non lo deve sapere.
  const x = (percento: number) => Math.round(Math.min(100, Math.max(0, (percento - inizio) / (100 - inizio) * 100)) * 100) / 100;

  // Le etichette sopra la riga: ci sta gia' quella del massimale, in fondo a destra (x = 100).
  const sopra: number[] = [100];
  const sotto: number[] = [];
  const libero = (lato: number[], pos: number) => lato.every(q => Math.abs(q - pos) >= SPAZIO_ETICHETTA);

  const disegnati = ordinati.map(p => {
    const pos = x(p.percento);
    const sulSotto = !libero(sopra, pos) && libero(sotto, pos);
    (sulSotto ? sotto : sopra).push(pos);
    return { chiave: p.chiave, testo: kgIt(p.kg), x: pos, sotto: sulSotto, scelto: p.scelto };
  });

  return { inizio, punti: disegnati, da: disegnati[0].x, a: disegnati[disegnati.length - 1].x };
}
