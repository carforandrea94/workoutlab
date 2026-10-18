import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

/**
 * Quello che serve a disegnare una pagina vera in un test: il router (vuoto),
 * Ionic con la stessa modalita' dell'app. Le icone sono SVG nel bundle e non
 * vanno registrate; lo stile (ios o md) segue lo user agent di jsdom, che non
 * e' Safari: chi deve vederle in uno stile preciso fornisce STILE_ICONE.
 * Il resto - servizi, rotta attiva - lo mette ogni test, con dei finti.
 */
export function providerPagina(rotte: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(rotte),
    provideIonicAngular({ mode: 'ios', backButtonText: '' })
  ];
}
