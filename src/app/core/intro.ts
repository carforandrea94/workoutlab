import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';

/**
 * L'intro dell'avvio, al posto della schermata nera.
 *
 * La disegna index.html (#intro), prima che Angular parta: l'icona dell'app
 * con i dischi che si alzano a onda e il nome. Prima, fra il tocco sull'icona
 * e la prima pagina, si vedeva il fondo nero per tutto il tempo in cui l'app
 * si avviava e le guardie aspettavano l'accesso, il profilo e il protocollo.
 * Qui c'e' solo come se ne va: quando la prima pagina e' arrivata, con una
 * dissolvenza che allarga appena l'icona, come quando iOS apre un'app.
 */

/**
 * Quanto resta almeno, dall'inizio del caricamento della pagina: un'intro
 * che sparisce dopo un attimo e' un lampo, non un'intro. Basta al nome per
 * arrivare e ai dischi per fare un'onda; se l'avvio e' piu' lento non pesa.
 */
export const INTRO_MINIMO_MS = 600;
/** La dissolvenza in uscita (la transizione di #intro.intro-via in index.html). */
export const INTRO_USCITA_MS = 320;
/**
 * Se la prima pagina non arriva (una guardia ferma, un errore che non diventa
 * NavigationError), l'intro non deve restare per sempre sopra l'app.
 */
export const INTRO_TETTO_MS = 15000;

/** Due fotogrammi: nel primo si disegna la pagina sotto, nel secondo parte la dissolvenza. */
function dopoIlDisegno(fn: () => void): void {
  if (typeof requestAnimationFrame !== 'function') { setTimeout(fn, 32); return; }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Toglie l'intro alla prima navigazione finita (anche finita male: dietro
 * deve vedersi l'errore, non l'icona), non prima di INTRO_MINIMO_MS dall'avvio.
 * `ora` e' il tempo dall'inizio del caricamento, come performance.now().
 */
export function chiudiIntroAllaPrimaPagina(
  router: Pick<Router, 'events'>,
  doc: Document = document,
  ora: () => number = () => performance.now()
): void {
  const intro = doc.getElementById('intro');
  if (!intro) return;
  let fatto = false;
  let sub: Subscription | null = null;
  const via = () => {
    if (fatto) return;
    fatto = true;
    sub?.unsubscribe();
    clearTimeout(tetto);
    dopoIlDisegno(() => {
      intro.classList.add('intro-via');
      intro.setAttribute('aria-busy', 'false');
      setTimeout(() => intro.remove(), INTRO_USCITA_MS + 80);
    });
  };
  const tetto = setTimeout(via, INTRO_TETTO_MS);
  sub = router.events
    .pipe(filter(e => e instanceof NavigationEnd || e instanceof NavigationError), take(1))
    .subscribe(() => setTimeout(via, Math.max(0, INTRO_MINIMO_MS - ora())));
}
