import { EnvironmentProviders, Provider, importProvidersFrom } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { LucideAngularModule } from 'lucide-angular';
import { APP_ICONS } from '../app/core/icons';

/**
 * Quello che serve a disegnare una pagina vera in un test: il router (vuoto),
 * Ionic con la stessa modalita' dell'app e le icone che l'app registra.
 * Il resto - servizi, rotta attiva - lo mette ogni test, con dei finti.
 */
export function providerPagina(rotte: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(rotte),
    provideIonicAngular({ mode: 'ios', backButtonText: '' }),
    importProvidersFrom(LucideAngularModule.pick(APP_ICONS))
  ];
}
