import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { IonTabs, IonTabBar, IonTabButton } from '@ionic/angular';
import { LucideAngularModule } from 'lucide-angular';
import { WorkoutDataService } from '../services/workout-data.service';
import { WorkoutSessionStateService } from '../services/workout-session-state.service';
import { RestBarComponent } from '../components/rest-bar/rest-bar.component';

interface Tab { id: string; label: string; icon: string; }

/** Le schede, nell'ordine della barra. */
const TABS: Tab[] = [
  { id: 'scheda', label: 'Scheda', icon: 'dumbbell' },
  { id: 'dieta', label: 'Dieta', icon: 'utensils' },
  { id: 'corsa', label: 'Corsa', icon: 'sport-shoe' },
  { id: 'misure', label: 'Misure', icon: 'ruler' },
  { id: 'account', label: 'Account', icon: 'user' }
];

/**
 * La barra in basso, una pila di navigazione per scheda.
 *
 * Ionic assegna la pila dal primo segmento dell'URL: /scheda/day/2 e
 * /scheda/protocolli/builder/x stanno nella pila "scheda", /dieta/lista-spesa
 * in quella "dieta".
 *
 * L'aspetto e' quello della pillola dell'app originale (le classi .tabbar,
 * .tabbtn e .pill di styles.css), non la barra standard di Ionic.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, LucideAngularModule, RestBarComponent],
  template: `
    <ion-tabs (ionTabsDidChange)="selected.set($event.tab)">
      <div class="tabfade"></div>
      <ion-tab-bar slot="bottom" class="tabbar tabbar-5" [style.display]="showRestBar ? 'none' : null">
        <div class="pill" [class]="'pill p' + selectedIndex()"></div>
        @for (t of tabs; track t.id) {
          <ion-tab-button [tab]="t.id" class="tabbtn" [class.active]="selected() === t.id">
            <span class="ic"><lucide-icon [name]="t.icon" [size]="23"></lucide-icon></span>
            <span class="tablabel">{{ t.label }}</span>
          </ion-tab-button>
        }
      </ion-tab-bar>
      <!-- Durante una seduta la barra lascia il posto al recupero: in mezzo a
           un allenamento serve sapere quanto manca, non cambiare sezione. -->
      @if (showRestBar) {
        <app-rest-bar></app-rest-bar>
      }
    </ion-tabs>
  `
})
export class TabsPage implements OnInit, OnDestroy {
  readonly selected = signal<string>('');
  private dayIdOnScreen: string | null = null;
  private routeSub: Subscription | null = null;

  constructor(
    private router: Router,
    private workoutData: WorkoutDataService,
    private sessionState: WorkoutSessionStateService
  ) {}

  readonly tabs = TABS;

  selectedIndex(): number {
    return Math.max(0, this.tabs.findIndex(t => t.id === this.selected()));
  }

  /**
   * Solo sul giorno che si sta ALLENANDO: con una sessione aperta su un altro
   * giorno quella schermata e' in sola lettura, e togliere la navigazione a
   * chi sta solo guardando sarebbe un dispetto.
   */
  get showRestBar(): boolean {
    return this.dayIdOnScreen !== null && this.sessionState.isActiveForDay(this.dayIdOnScreen);
  }

  ngOnInit(): void {
    this.leggiUrl(this.router.url);
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.leggiUrl(e.urlAfterRedirects || e.url));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private leggiUrl(url: string): void {
    const u = url.split('?')[0];
    const giorno = u.match(/^\/scheda\/day\/(\d+)$/);
    this.dayIdOnScreen = giorno ? (this.workoutData.days[+giorno[1]]?.id ?? null) : null;
  }
}
