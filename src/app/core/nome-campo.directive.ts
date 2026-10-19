import { AfterViewInit, Directive, ElementRef } from '@angular/core';

/**
 * Il testo con cui si legge un campo: la sua etichetta scritta accanto, o in
 * mancanza il segnaposto. Vuoto se non c'e' niente da leggere.
 *
 * Nei form dell'app l'etichetta e' un <label> sopra il campo. Quando c'e' un
 * `for`, punta all'<ion-input> (un elemento custom, non "etichettabile") e non
 * all'<input> vero che sta dentro: per uno screen reader il campo restava senza
 * nome. Si risale quindi alla scatola del campo (.authfield, .measure-field) e
 * si prende il suo primo <label>.
 */
export function nomeDelCampo(campo: HTMLElement): string {
  const pulisci = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

  const id = campo.id;
  const perId = id ? campo.ownerDocument.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`) : null;
  const dellaScatola = campo.closest('.authfield, .measure-field')?.querySelector('label') ?? null;

  return pulisci(perId?.textContent) || pulisci(dellaScatola?.textContent) || pulisci(campo.getAttribute('placeholder'));
}

/**
 * Il campo ha un'etichetta sua, quella di Ionic: la prop `label` (scritta come
 * attributo o legata) o un elemento in slot="label". Ionic la mette in un
 * <label> intorno all'<input> vero, e quello e' gia' il suo nome.
 */
export function haEtichettaIonic(campo: HTMLElement): boolean {
  const prop = (campo as HTMLElement & { label?: unknown }).label;
  return !!(campo.getAttribute('label')?.trim() || (typeof prop === 'string' && prop.trim()) || campo.querySelector(':scope > [slot="label"]'));
}

/**
 * Da' un nome accessibile ai campi Ionic (ion-input, ion-searchbar, ion-select)
 * che non ne hanno uno esplicito: un `aria-label` o `aria-labelledby` messo a
 * mano vince sempre, e cosi' l'etichetta di Ionic (vedi haEtichettaIonic): un
 * aria-label preso dal segnaposto ci passerebbe sopra, e "Es. Panca piana"
 * diventerebbe il nome del campo "Nome". Va importata nei componenti che hanno
 * dei campi; non serve scrivere niente nei template.
 *
 * Ionic gira l'`aria-label` dell'host sull'<input> vero quando carica il
 * componente. Se il nome arriva dopo quel momento si scrive anche sull'<input>,
 * altrimenti resterebbe sull'host dove lo screen reader non lo cerca.
 */
@Directive({
  selector: 'ion-input, ion-searchbar, ion-select',
  standalone: true
})
export class NomeCampoDirective implements AfterViewInit {
  constructor(private el: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const campo = this.el.nativeElement;
    if (campo.hasAttribute('aria-label') || campo.hasAttribute('aria-labelledby')) return;
    if (haEtichettaIonic(campo)) return;

    const nome = nomeDelCampo(campo);
    if (!nome) return;
    campo.setAttribute('aria-label', nome);

    const pronto = (campo as HTMLElement & { componentOnReady?: () => Promise<unknown> }).componentOnReady?.();
    void pronto?.then(() => {
      const nativo = campo.querySelector('input, textarea');
      if (nativo && !nativo.hasAttribute('aria-label') && !nativo.hasAttribute('aria-labelledby')) {
        nativo.setAttribute('aria-label', nome);
      }
    });
  }
}
