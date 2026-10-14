import { Component } from '@angular/core';

/**
 * Il marchio dell'app. E' SVG in linea e non un <img>: i colori arrivano da
 * --accent e --ink-subdued, e un file esterno non vedrebbe le variabili della
 * pagina, quindi resterebbe fermo sui colori del tema scuro anche in chiaro.
 *
 * Le misure le decide chi lo usa (vedi .authlogo): il componente si limita a
 * riempire lo spazio che riceve.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  templateUrl: './logo.component.html'
})
export class LogoComponent {}
