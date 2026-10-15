import { Component, OnInit, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';

import { DietDataService } from '../../services/diet-data.service';
import { AppStateService } from '../../services/app-state.service';
import { todayLocalISO } from '../../core/utils/date.util';
import { DietPlan } from '../../models/diet.model';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonButton } from '@ionic/angular';

interface DietPlanCard {
  plan: DietPlan;
  itemCount: number;
}

@Component({
  selector: 'app-dieta',
  standalone: true,
  imports: [IonButton, ...IONIC_LIST, ...IONIC_PAGE, ...IONIC_LINKS, CommonModule, LucideAngularModule],
  templateUrl: './dieta.component.html'
})
export class DietaComponent implements OnInit {
  cards: DietPlanCard[] = [];

  /**
   * I pasti segnati come fatti oggi (id del pasto -> fatto). E' un signal perche'
   * arriva da una lettura asincrona: un campo semplice cambiato dopo un await non
   * farebbe ridisegnare la pagina (l'app non usa zone.js).
   */
  private readonly fattiOggi = signal<Record<string, boolean>>({});

  constructor(
    public dietData: DietDataService,
    private nav: NavController,
    private appState: AppStateService
  ) {}

  ngOnInit(): void {
    this.buildCards();
    void this.caricaFatti();
  }

  /** Pagina viva nella pila: il protocollo attivo puo' essere cambiato dai Protocolli, e dal dettaglio si possono aver segnato dei pasti. */
  ionViewWillEnter(): void {
    this.buildCards();
    void this.caricaFatti();
  }

  private async caricaFatti(): Promise<void> {
    try {
      const stato = await this.appState.load();
      const c = stato.mealsCompletion;
      this.fattiOggi.set(c && c.date === todayLocalISO() ? { ...c.done } : {});
    } catch {
      // Senza lo stato la card resta senza avanzamento, non senza piani.
      this.fattiOggi.set({});
    }
  }

  /** "2/4 pasti oggi": quanti pasti del piano sono segnati come fatti oggi. */
  pasti(card: DietPlanCard): string {
    const fatti = this.fattiOggi();
    const totali = card.plan.meals.length;
    const n = card.plan.meals.filter(m => fatti[m.id]).length;
    return `${n}/${totali} pasti oggi`;
  }

  private countItems(plan: DietPlan): number {
    return plan.meals.reduce((acc, meal) => {
      const inCombos = meal.combinations.reduce((a, c) =>
        a + (c.carb ? 1 : 0) + (c.protein ? 1 : 0) + (c.fat ? 1 : 0), 0);
      const inAlt = (['carb', 'protein', 'fat'] as const).reduce((a, cat) => a + meal.alternatives[cat].length, 0);
      return acc + inCombos + inAlt;
    }, 0);
  }

  private buildCards(): void {
    this.cards = this.dietData.diet.map(plan => ({ plan, itemCount: this.countItems(plan) }));
  }

  get hasAnyDietData(): boolean {
    return this.cards.length > 0;
  }

  openCard(card: DietPlanCard): void {
    this.nav.navigateForward(['/dieta', card.plan.id]);
  }
}
