import { Directive, ElementRef, computed, input } from '@angular/core';

/**
 * Rende un elemento cliccabile raggiungibile da tastiera e da screen reader.
 *
 * Intestazioni a fisarmonica, righe a selezione, trattini dello slider erano
 * <div> con un (click): niente Tab, niente Invio, niente ruolo - per chi non
 * usa il dito non esistevano. Cambiarli in <button> avrebbe toccato il
 * disegno di ciascuno; qui si aggiunge soltanto quello che manca:
 *  - ruolo ("button", o "checkbox" per cio' che si spunta) e tabindex;
 *  - Invio e Spazio fanno il click, quindi un solo percorso per il gesto;
 *  - un anello di focus visibile (.tasto:focus-visible in styles.css).
 *
 * Lo stato si dichiara dove si usa, perche' dipende dal contenuto:
 * [attr.aria-expanded] per ciò che si apre, [attr.aria-checked] per la spunta.
 *
 * Dove l'elemento cliccabile contiene altri controlli (un cestino, un chip),
 * un ruolo "button" sul contenitore sarebbe un controllo dentro un controllo:
 * la direttiva va sul titolo, e il click sintetico risale al contenitore, che
 * continua a fare quello che faceva.
 */
@Directive({
  selector: '[appTasto]',
  standalone: true,
  host: {
    class: 'tasto',
    tabindex: '0',
    '[attr.role]': 'ruolo()',
    '(keydown)': 'allaTastiera($event)'
  }
})
export class TastoDirective {
  /** Vuoto = "button"; "checkbox" per cio' che si spunta. */
  readonly appTasto = input<'' | 'button' | 'checkbox'>('');
  protected readonly ruolo = computed(() => this.appTasto() || 'button');

  constructor(private el: ElementRef<HTMLElement>) {}

  protected allaTastiera(e: KeyboardEvent): void {
    // Un tasto premuto su un figlio (un campo, un pulsante) non e' per noi.
    if (e.target !== this.el.nativeElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // Spazio farebbe scorrere la pagina.
      e.preventDefault();
      this.el.nativeElement.click();
    }
  }
}
