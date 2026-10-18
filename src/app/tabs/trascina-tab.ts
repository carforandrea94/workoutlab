/**
 * Scorrere col dito sulla barra delle tab, come su iOS 26: la pastiglia della
 * tab aperta si stacca (si ingrandisce un poco, come una lente), segue il dito,
 * e alzandolo si apre la tab che c'e' sotto. Il tocco resta un tocco: il gesto
 * parte solo se il dito scorre di lato o resta premuto.
 *
 * Qui c'e' solo il gesto, senza Angular: chi lo usa sa cosa vuol dire "lente su
 * questa tab" e "apri questa tab". Gli eventi sono ascoltati a mano e non dal
 * template perche' pointermove arriva a ogni fotogramma, e in un'app zoneless
 * ogni evento del template rifa' il controllo della vista: qui la vista si
 * tocca solo quando la tab sotto il dito cambia.
 */

/** Le tab in fila: dove comincia la prima e quanto e' larga ognuna (sono tutte uguali, flex:1). */
export interface Corsia {
  inizio: number;
  passo: number;
  n: number;
}

const tra = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** La tab sotto il dito; oltre i bordi, la prima o l'ultima. */
export function indiceSotto(x: number, c: Corsia): number {
  return tra(Math.floor((x - c.inizio) / c.passo), 0, c.n - 1);
}

/** Di quanto spostare la pastiglia dal posto della prima tab: centrata sul dito, mai fuori dalla fila. */
export function spostamento(x: number, c: Corsia): number {
  return tra(x - c.inizio - c.passo / 2, 0, c.passo * (c.n - 1));
}

/** Oltre questi pixel e' uno scorrimento, non piu' un tocco. */
export const SOGLIA_PX = 8;
/** Premuto fermo cosi' a lungo, la lente si alza anche senza muoversi. */
export const ATTESA_MS = 300;

export interface AzioniTrascina {
  /** La lente e' sopra questa tab, o si e' posata (null). */
  lente(indice: number | null): void;
  /**
   * Il dito si e' alzato sopra questa tab. scorso: il dito si e' mosso; se no
   * era una pressione lunga sul posto, e vale come un tocco su quella tab.
   */
  scegli(indice: number, scorso: boolean): void;
}

export class TrascinaTab {
  private dito: number | null = null;
  private x0 = 0;
  private y0 = 0;
  private x = 0;
  private alzata = false;
  private scorso = false;
  private corsia: Corsia | null = null;
  private sotto = -1;
  private attesa: ReturnType<typeof setTimeout> | null = null;
  /** Dopo un trascinamento il clic che segue non e' un tocco su una tab: non deve aprirla ne' seguire il link. */
  private bloccaClic = false;

  constructor(
    private readonly barra: HTMLElement,
    private readonly tasti: () => HTMLElement[],
    private readonly pastiglia: () => HTMLElement | null,
    private readonly azioni: AzioniTrascina
  ) {
    barra.addEventListener('pointerdown', this.giu);
    barra.addEventListener('pointermove', this.muovi);
    barra.addEventListener('pointerup', this.su);
    barra.addEventListener('pointercancel', this.annulla);
    barra.addEventListener('lostpointercapture', this.perso);
    barra.addEventListener('contextmenu', this.menu);
    barra.addEventListener('click', this.clic, true);
  }

  distruggi(): void {
    this.lascia();
    this.barra.removeEventListener('pointerdown', this.giu);
    this.barra.removeEventListener('pointermove', this.muovi);
    this.barra.removeEventListener('pointerup', this.su);
    this.barra.removeEventListener('pointercancel', this.annulla);
    this.barra.removeEventListener('lostpointercapture', this.perso);
    this.barra.removeEventListener('contextmenu', this.menu);
    this.barra.removeEventListener('click', this.clic, true);
  }

  private giu = (e: PointerEvent) => {
    // Un clic arriva sempre dopo il suo pointerdown: se ne e' rimasto uno da
    // bloccare (il trascinamento finito senza clic), non e' questo.
    this.bloccaClic = false;
    if (this.dito !== null || !e.isPrimary || e.button !== 0) return;
    this.dito = e.pointerId;
    this.x0 = this.x = e.clientX;
    this.y0 = e.clientY;
    this.attesa = setTimeout(() => this.alza(), ATTESA_MS);
  };

  private muovi = (e: PointerEvent) => {
    if (e.pointerId !== this.dito) return;
    this.x = e.clientX;
    const dx = Math.abs(e.clientX - this.x0);
    const dy = Math.abs(e.clientY - this.y0);
    if (!this.scorso && dx < SOGLIA_PX && dy < SOGLIA_PX) return;
    if (!this.alzata) {
      // Verso l'alto o il basso non e' un gesto della barra.
      if (dy > dx) { this.lascia(); return; }
      this.scorso = true;
      this.alza();
      return;
    }
    this.scorso = true;
    this.segui();
  };

  private su = (e: PointerEvent) => {
    if (e.pointerId !== this.dito) return;
    const scelta = this.alzata ? this.sotto : -1;
    // La scelta la fa il gesto: il clic che il browser manda dopo (o non
    // manda, dopo una pressione lunga) non conta.
    if (this.alzata) this.bloccaClic = true;
    // Prima la scelta, poi la lente che si posa: chi ascolta tiene la
    // pastiglia sulla tab scelta mentre la navigazione arriva.
    if (scelta >= 0) this.azioni.scegli(scelta, this.scorso);
    this.lascia();
  };

  private annulla = (e: PointerEvent) => {
    if (e.pointerId === this.dito) this.lascia();
  };

  // Conta solo la barra che perde il dito: quando lo prende lei, lo perde il
  // tasto che l'aveva (col tocco il dito e' di chi l'ha toccato), e l'evento
  // risale fin qui.
  private perso = (e: PointerEvent) => {
    if (e.target === this.barra && e.pointerId === this.dito) this.lascia();
  };

  // Una pressione lunga su Android apre il menu del link: durante il gesto no.
  private menu = (e: Event) => {
    if (this.dito !== null) e.preventDefault();
  };

  private clic = (e: MouseEvent) => {
    // detail 0: un clic da tastiera (Invio sulla tab), mai bloccato.
    if (!this.bloccaClic || e.detail === 0) return;
    this.bloccaClic = false;
    e.preventDefault();
    e.stopPropagation();
  };

  private alza(): void {
    if (this.attesa) { clearTimeout(this.attesa); this.attesa = null; }
    const tasti = this.tasti();
    if (this.dito === null || tasti.length === 0) return;
    const primo = tasti[0].getBoundingClientRect();
    const ultimo = tasti[tasti.length - 1].getBoundingClientRect();
    const passo = (ultimo.right - primo.left) / tasti.length;
    if (!(passo > 0)) return;
    this.corsia = { inizio: primo.left, passo, n: tasti.length };
    this.alzata = true;
    // Con il dito trattenuto dalla barra, i movimenti arrivano anche se esce dai suoi bordi.
    try { this.barra.setPointerCapture?.(this.dito); } catch { /* il dito e' gia' andato */ }
    this.segui();
  }

  private segui(): void {
    const c = this.corsia;
    if (!c) return;
    const p = this.pastiglia();
    if (p) p.style.transform = `translateX(${spostamento(this.x, c)}px)`;
    const i = indiceSotto(this.x, c);
    if (i !== this.sotto) {
      this.sotto = i;
      this.azioni.lente(i);
    }
  }

  private lascia(): void {
    if (this.attesa) { clearTimeout(this.attesa); this.attesa = null; }
    const { alzata, dito } = this;
    // Prima si azzera tutto: rilasciare il dito puo' far arrivare qui
    // lostpointercapture, che allora non trova piu' niente da lasciare.
    this.alzata = false;
    this.scorso = false;
    this.dito = null;
    this.corsia = null;
    this.sotto = -1;
    if (!alzata) return;
    // Via la posizione del dito: la pastiglia torna al posto che le da' la
    // sua classe, con la molla di sempre.
    this.pastiglia()?.style.removeProperty('transform');
    try { if (dito !== null) this.barra.releasePointerCapture?.(dito); } catch { /* gia' rilasciato */ }
    this.azioni.lente(null);
  }
}
