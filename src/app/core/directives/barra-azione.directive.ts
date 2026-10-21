import { Directive, ElementRef, OnDestroy, inject, signal } from '@angular/core';
import { RiduciBarra, posizioneDaEvento } from '../../tabs/riduci-barra';

/**
 * Il comando principale di una pagina interna, in basso, come la barra delle
 * tab: una pillola staccata dal fondo (ion-footer.barra-azione, vedi
 * styles.css) sopra il contenuto che le passa sotto. Questa direttiva, su
 * ion-content, le dice quando farsi piccola e quando andarsene:
 *
 * - scorrendo in giu' la pagina si riduce, scorrendo in su torna intera, in
 *   cima e' sempre intera: la stessa decisione della barra delle tab
 *   (riduci-barra.ts);
 * - con la tastiera dell'app nativa se ne va, come Ionic fa con la barra
 *   delle tab. Gli eventi sono quelli di Capacitor: nel browser non arrivano,
 *   e la barra resta.
 *
 * Nel template:
 *   <ion-content appBarraAzione #barra="barraAzione" [scrollEvents]="true" [class.con-barra]="...">
 *   <ion-footer class="barra-azione" [class.ridotta]="barra.ridotta()" [class.con-tastiera]="barra.tastiera()">
 *
 * L'allenamento (scheda-detail) fa lo stesso a mano, perche' la sua barra
 * torna intera anche cambiando esercizio e dopo il recupero.
 */
@Directive({
  selector: 'ion-content[appBarraAzione]',
  standalone: true,
  exportAs: 'barraAzione'
})
export class BarraAzioneDirective implements OnDestroy {
  /** Scorrendo in giu': la pillola si fa piu' piccola. */
  readonly ridotta = signal(false);
  /** La tastiera dell'app nativa e' aperta: la barra non c'e'. */
  readonly tastiera = signal(false);

  private readonly el: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly riduci = new RiduciBarra(r => this.ridotta.set(r));

  private readonly alloScorrere = (e: Event): void => {
    const p = posizioneDaEvento(e);
    if (p) this.riduci.scorri(p.pagina, p.y, p.max);
  };
  private readonly tastieraSu = (): void => this.tastiera.set(true);
  private readonly tastieraGiu = (): void => this.tastiera.set(false);

  constructor() {
    this.el.addEventListener('ionScroll', this.alloScorrere);
    if (typeof window === 'undefined') return;
    window.addEventListener('keyboardWillShow', this.tastieraSu);
    window.addEventListener('keyboardWillHide', this.tastieraGiu);
  }

  ngOnDestroy(): void {
    this.el.removeEventListener('ionScroll', this.alloScorrere);
    if (typeof window === 'undefined') return;
    window.removeEventListener('keyboardWillShow', this.tastieraSu);
    window.removeEventListener('keyboardWillHide', this.tastieraGiu);
  }
}
