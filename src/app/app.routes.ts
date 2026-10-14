import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { protocolGuard } from './core/guards/protocol.guard';
import { profileGuard, onboardingGuard } from './core/guards/profile.guard';

/**
 * Due livelli: le pagine senza barra (accesso, iscrizione, dati mancanti, privacy) e, sotto
 * TabsPage, tutto il resto. Dentro le tab il primo segmento dell'URL e' la
 * pila di navigazione: scheda, dieta, corsa, misure, account. L'editor dei
 * protocolli sta nella pila "scheda", sotto /scheda/protocolli.
 *
 * L'ordine conta dove un segmento fisso e uno variabile si somigliano
 * (dieta/lista-spesa prima di dieta/:mode, misure/storico prima di
 * misure/:categoria).
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'registrati',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent)
  },
  {
    // I dati dell'account che mancano: ci si arriva dopo l'accesso, dalla
    // guardia dell'app, e solo finche' ne mancano.
    path: 'benvenuto',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./pages/benvenuto/benvenuto.component').then(m => m.BenvenutoComponent)
  },
  {
    // Senza guardia: ci si arriva anche da chi ha l'iscrizione a meta'.
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: '',
    canActivate: [authGuard, profileGuard, protocolGuard],
    loadComponent: () => import('./tabs/tabs.page').then(m => m.TabsPage),
    children: [
      { path: '', redirectTo: 'scheda', pathMatch: 'full' },

      // ---- Scheda ----
      {
        path: 'scheda',
        loadComponent: () => import('./pages/scheda-list/scheda-list.component').then(m => m.SchedaListComponent)
      },
      {
        path: 'scheda/day/:n',
        loadComponent: () => import('./pages/scheda-detail/scheda-detail.component').then(m => m.SchedaDetailComponent)
      },
      {
        path: 'scheda/storico',
        loadComponent: () => import('./pages/history-list/history-list.component').then(m => m.HistoryListComponent)
      },
      {
        // La seduta salvata si apre nella stessa pagina dell'allenamento, in
        // modalita' storico: stessi controlli, nessun codice duplicato.
        path: 'scheda/storico/:key',
        data: { modo: 'storico' },
        loadComponent: () => import('./pages/scheda-detail/scheda-detail.component').then(m => m.SchedaDetailComponent)
      },
      {
        path: 'scheda/info',
        loadComponent: () => import('./pages/scheda-info/scheda-info.component').then(m => m.SchedaInfoComponent)
      },

      // ---- Protocolli: scheda, dieta e obiettivo di corsa dell'utente ----
      {
        path: 'scheda/protocolli',
        loadComponent: () => import('./pages/protocolli/protocolli.component').then(m => m.ProtocolliComponent)
      },
      {
        path: 'scheda/protocolli/nuovo',
        loadComponent: () => import('./pages/protocollo-nuovo/protocollo-nuovo.component').then(m => m.ProtocolloNuovoComponent)
      },
      {
        path: 'scheda/protocolli/importa-pdf',
        loadComponent: () => import('./pages/protocollo-import/protocollo-import.component').then(m => m.ProtocolloImportComponent)
      },
      {
        path: 'scheda/protocolli/aggiorna-pdf/:protocolId',
        loadComponent: () => import('./pages/protocollo-import/protocollo-import.component').then(m => m.ProtocolloImportComponent)
      },
      {
        path: 'scheda/protocolli/builder/:protocolId',
        loadComponent: () => import('./pages/protocollo-builder/protocollo-builder.component').then(m => m.ProtocolloBuilderComponent)
      },

      // ---- Dieta ----
      {
        path: 'dieta',
        loadComponent: () => import('./pages/dieta/dieta.component').then(m => m.DietaComponent)
      },
      {
        path: 'dieta/lista-spesa',
        loadComponent: () => import('./pages/lista-spesa/lista-spesa.component').then(m => m.ListaSpesaComponent)
      },
      {
        path: 'dieta/:mode',
        loadComponent: () => import('./pages/dieta-detail/dieta-detail.component').then(m => m.DietaDetailComponent)
      },

      // ---- Corsa ----
      {
        path: 'corsa',
        loadComponent: () => import('./pages/corsa/corsa.component').then(m => m.CorsaComponent)
      },
      {
        path: 'corsa/nuova',
        loadComponent: () => import('./pages/corsa-nuova/corsa-nuova.component').then(m => m.CorsaNuovaComponent)
      },

      // ---- Misure ----
      {
        path: 'misure',
        loadComponent: () => import('./pages/misure/misure.component').then(m => m.MisureComponent)
      },
      {
        path: 'misure/storico',
        loadComponent: () => import('./pages/misure-storico/misure-storico.component').then(m => m.MisureStoricoComponent)
      },
      {
        path: 'misure/analytics',
        loadComponent: () => import('./pages/misure-analytics/misure-analytics.component').then(m => m.MisureAnalyticsComponent)
      },
      {
        path: 'misure/:categoria',
        loadComponent: () => import('./pages/misura-categoria/misura-categoria.component').then(m => m.MisuraCategoriaComponent)
      },
      {
        path: 'misure/storico/:key',
        loadComponent: () => import('./pages/misure-storico-detail/misure-storico-detail.component').then(m => m.MisureStoricoDetailComponent)
      },

      // ---- Account ----
      {
        path: 'account',
        loadComponent: () => import('./pages/account/account.component').then(m => m.AccountComponent)
      },
      {
        path: 'account/impostazioni',
        loadComponent: () => import('./pages/impostazioni/impostazioni.component').then(m => m.ImpostazioniComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'scheda' }
];
