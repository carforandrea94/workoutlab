import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PRIVACY_VERSION } from '../../core/privacy';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';

/**
 * L'informativa, dentro l'app e non su un sito a parte: cosi' resta leggibile
 * anche senza rete, ed e' versionata insieme al codice che tratta i dati di
 * cui parla.
 *
 * Quello che l'app NON fa ancora, e che va fatto se il testo cambia: chiedere
 * di nuovo l'accettazione a chi aveva accettato una versione precedente. Oggi
 * l'accettazione si raccoglie solo all'iscrizione.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [...IONIC_PAGE, CommonModule, ...IONIC_LINKS],
  templateUrl: './privacy.component.html',
  styles: [`
    .doc { max-width: 680px; margin: 0 auto; padding: 28px 20px calc(28px + var(--safe-b-sys)); }
    .doc h1 { font-weight: 800; font-size: 28px; letter-spacing: -.015em; margin: 0 0 4px; }
    .doc .ver {
      font-variant-numeric: tabular-nums; font-size: var(--text-xs);
      color: var(--label-3); margin-bottom: 24px;
    }
    .doc h2 {
      font-weight: 700; font-size: var(--text-lg); letter-spacing: -.005em;
      margin: 26px 0 8px; color: var(--label);
    }
    .doc p, .doc li {
      font-size: var(--text-md); line-height: 1.6; color: var(--label-2); margin: 0 0 10px;
    }
    .doc ul { margin: 0 0 10px; padding-left: 20px; }
    .doc b { color: var(--label); }
    /* Quello che solo il titolare sa. Si vede che manca, invece di sembrare
       scritto: un'informativa con un buco silenzioso e' peggio che non averla. */
    .doc mark {
      background: rgba(255, 159, 10, .18); color: var(--effort-hard);
      padding: 1px 5px; border-radius: var(--r-xs); font-weight: 600;
    }
    .doc .torna { display: inline-flex; align-items: center; min-height: 44px; }
  `]
})
export class PrivacyComponent {
  readonly versione = PRIVACY_VERSION;
}
