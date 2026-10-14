import { Component, OnInit } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';

import { DietDataService } from '../../services/diet-data.service';
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

  constructor(
    public dietData: DietDataService,
    private nav: NavController
  ) {}

  ngOnInit(): void {
    this.buildCards();
  }

  /** Pagina viva nella pila: il protocollo attivo puo' essere cambiato dai Protocolli. */
  ionViewWillEnter(): void {
    this.buildCards();
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
