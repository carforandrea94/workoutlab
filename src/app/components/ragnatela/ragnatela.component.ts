import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Andamento } from '../../core/utils/session-summary.util';

/** Un raggio: un esercizio, e di quanto e' cambiato dalla volta scorsa. */
export interface AsseRagnatela {
  /** Il numero dell'esercizio nella seduta: lo stesso della riga sotto la ragnatela. */
  n: number;
  nome: string;
  /** La variazione, come frazione: +0,13 = +13%. */
  v: number;
  andamento: Andamento;
  /** La variazione come si legge: "+13%", "+30 rip.", "uguale". */
  testo: string;
}

/** Il bordo della ragnatela: +30%. Oltre, la punta si ferma qui e diventa una freccia. */
export const SCALA_RAGNATELA = 0.3;

const W = 320;
const H = 292;
const CX = W / 2;
const CY = H / 2 + 2;
/** Il raggio del bordo (+30%). */
const R = 100;
/** Dove stanno i numeri, fuori dal bordo. */
const R_NUMERI = R + 24;
const f = (n: number) => n.toFixed(1);

/** La prima volta la forma di oggi nasce dal tratteggio: il momento del resoconto. */
export const NASCITA_MS = 720;
/** Fra Forza e Volume si trasforma da una misura all'altra, piu' in fretta. */
export const CAMBIO_MS = 420;
/** Decelerazione esponenziale: parte decisa e si posa piano, senza rimbalzi. */
const decelera = (k: number) => 1 - Math.pow(1 - k, 4);

/** La distanza dal centro di una variazione: il centro e' -30%, il tratteggio (la volta scorsa) zero, il bordo +30%. */
export function raggioDi(v: number): number {
  const c = Math.max(-SCALA_RAGNATELA, Math.min(SCALA_RAGNATELA, v));
  return R * (0.15 + 0.85 * (c + SCALA_RAGNATELA) / (2 * SCALA_RAGNATELA));
}

/**
 * La ragnatela dei miglioramenti: un raggio per esercizio, nell'ordine della
 * seduta, e i numeri sono quelli dell'elenco sotto. Il tratteggio e' la volta
 * scorsa, cioe' zero: fuori e' meglio (la fascia verde), dentro peggio.
 *
 * La scala e' una sola per tutti i raggi, perche' ogni raggio e' una
 * variazione e non un valore: 56 kg di panca e 50 ripetizioni di crunch non si
 * mettono sullo stesso asse, +51% e +150% si'. Oltre il +30% la punta si ferma
 * al bordo e diventa una freccia: un punto sul bordo direbbe +30%, e un bordo
 * piu' largo schiaccerebbe tutti gli altri sul tratteggio.
 *
 * I numeri sono pulsanti veri (44 px, da tastiera, con il nome e la
 * variazione per chi non vede): scelgono l'esercizio di cui il resoconto
 * mostra il dettaglio. Il disegno e' nascosto allo screen reader, che ha
 * l'elenco degli esercizi con le stesse cifre.
 *
 * La forma di oggi non compare gia' fatta: nasce dal tratteggio della volta
 * scorsa e si allarga (o si stringe) fino a dove si e' arrivati oggi, cosi' si
 * vede il cambiamento, non solo il risultato. Passando fra Forza e Volume si
 * trasforma da una misura all'altra; cambiando idea a meta' riparte da dove
 * si trova. Con "riduci movimento" e' gia' al suo posto.
 */
@Component({
  selector: 'app-ragnatela',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ragnatela.component.html'
})
export class RagnatelaComponent {
  readonly assi = input.required<AsseRagnatela[]>();
  /** L'indice (in `assi`) dell'esercizio scelto. */
  readonly scelto = input<number | null>(null);
  /** Chi e' il tratteggio, per lo screen reader: "al 12 ottobre". */
  readonly prima = input('alla volta scorsa');
  readonly sceglie = output<number>();

  readonly larghezza = W;
  readonly altezza = H;
  readonly centro = { x: CX, y: CY };
  readonly scala = `+${Math.round(SCALA_RAGNATELA * 100)}%`;

  /** I raggi della forma di oggi mentre si muove; null quando e' ferma al suo posto. */
  private readonly inMoto = signal<number[] | null>(null);
  /** I raggi a cui si sta andando (o dove si e' arrivati). */
  private meta: number[] | null = null;
  private fotogramma = 0;

  constructor() {
    effect(() => {
      const meta = this.assi().map(a => raggioDi(a.v));
      untracked(() => this.muovi(meta));
    });
    inject(DestroyRef).onDestroy(() => this.ferma());
  }

  private muovi(meta: number[]): void {
    const vista = typeof window === 'undefined' ? null : window;
    const anima = !!vista && typeof vista.requestAnimationFrame === 'function' && typeof vista.matchMedia === 'function'
      && !vista.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Da dove si parte: da dove la forma e' adesso (anche a meta' strada); la
    // prima volta, o se i raggi non sono gli stessi, dal tratteggio.
    const adesso = this.inMoto() ?? this.meta;
    const nasce = !adesso || adesso.length !== meta.length;
    this.meta = meta;
    this.ferma();
    if (!anima || (!nasce && adesso.every((r, i) => r === meta[i]))) {
      this.inMoto.set(null);
      return;
    }
    const da = nasce ? meta.map(() => raggioDi(0)) : adesso;
    const durata = nasce ? NASCITA_MS : CAMBIO_MS;
    const t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / durata));
      const e = decelera(k);
      this.inMoto.set(k < 1 ? da.map((r, i) => r + (meta[i] - r) * e) : null);
      this.fotogramma = k < 1 ? requestAnimationFrame(passo) : 0;
    };
    this.inMoto.set(da);
    this.fotogramma = requestAnimationFrame(passo);
  }

  private ferma(): void {
    if (this.fotogramma) cancelAnimationFrame(this.fotogramma);
    this.fotogramma = 0;
  }

  private readonly angolo = (i: number) => (-90 + i * 360 / this.assi().length) * Math.PI / 180;
  private readonly punto = (i: number, r: number): [number, number] =>
    [CX + r * Math.cos(this.angolo(i)), CY + r * Math.sin(this.angolo(i))];
  private readonly poligono = (r: (i: number) => number) =>
    this.assi().map((_, i) => this.punto(i, r(i)).map(f).join(',')).join(' ');
  private readonly tracciato = (r: number) =>
    'M' + this.assi().map((_, i) => this.punto(i, r).map(f).join(' ')).join('L') + 'Z';

  readonly disegno = computed(() => {
    const assi = this.assi();
    const zero = raggioDi(0);
    const mossi = this.inMoto();
    // Durante il movimento i raggi sono quelli del fotogramma; fermi, i loro.
    const raggio = (i: number) => (mossi && mossi.length === assi.length ? mossi[i] : raggioDi(assi[i].v));
    return {
      // Fra il tratteggio e il bordo: dove si e' fatto meglio.
      meglio: `${this.tracciato(R)} ${this.tracciato(zero)}`,
      griglia: [-0.15, 0.15, SCALA_RAGNATELA].map(v => this.poligono(() => raggioDi(v))),
      raggi: assi.map((_, i) => this.punto(i, R).map(f)),
      prima: this.poligono(() => zero),
      oggi: this.poligono(raggio),
      punte: assi.map((a, i) => {
        const [x, y] = this.punto(i, raggio(i));
        if (a.v <= SCALA_RAGNATELA) return { oltre: false, x: f(x), y: f(y), punti: '' };
        const u = [Math.cos(this.angolo(i)), Math.sin(this.angolo(i))];
        const p = [-u[1], u[0]];
        const punti = [[x + u[0] * 9, y + u[1] * 9], [x + p[0] * 6, y + p[1] * 6], [x - p[0] * 6, y - p[1] * 6]]
          .map(q => q.map(f).join(',')).join(' ');
        return { oltre: true, x: f(x), y: f(y), punti };
      }),
      // La scala una volta sola, a meta' fra il raggio 3 e il 4: in basso a destra c'e' meno da coprire.
      etichetta: (() => { const [x, y] = this.punto(Math.min(2.5, assi.length - 0.5), R + 2); return { x: f(x - 2), y: f(y + 14) }; })(),
      numeri: assi.map((a, i) => {
        const [x, y] = this.punto(i, R_NUMERI);
        return { ...a, sx: `${(x / W * 100).toFixed(2)}%`, sy: `${(y / H * 100).toFixed(2)}%` };
      })
    };
  });

  etichetta(a: AsseRagnatela): string {
    return `${a.n}. ${a.nome}: ${a.testo} rispetto ${this.prima()}`;
  }
}
