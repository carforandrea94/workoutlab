/**
 * Cambia una vista con una dissolvenza incrociata (View Transitions): la
 * vecchia si dissolve, un poco sfocata, mentre la nuova arriva nello stesso
 * posto (le curve sono in styles.css, ::view-transition-old/new). Serve dove
 * la pagina resta la stessa e cambia il modo di guardarla, come elenco e
 * slider: prima il contenuto saltava da una forma all'altra in un fotogramma.
 *
 * `cambia` deve aggiornare il DOM subito (signal e detectChanges): il browser
 * fotografa la vista prima e dopo la chiamata. Dove la transizione non c'e', o
 * con "riduci movimento", si cambia di colpo come prima.
 */
export function conDissolvenza(cambia: () => void, doc: Document = document): void {
  const d = doc as Document & { startViewTransition?: (fn: () => void) => unknown };
  const ridotto = !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof d.startViewTransition !== 'function' || ridotto) {
    cambia();
    return;
  }
  d.startViewTransition(() => cambia());
}
