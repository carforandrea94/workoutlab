import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DietDataService } from '../../services/diet-data.service';
import { AppStateService } from '../../services/app-state.service';
import { GiornoService } from '../../core/giorno.service';
import { DietPlan } from '../../models/diet.model';
import { PosizioneCiclo, posizioneNelCiclo } from '../../core/utils/dieta-ciclo.util';
import { dataEstesa } from '../../core/utils/date.util';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonAvatar, IonBadge, IonButton, IonLabel, IonListHeader } from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';

interface DietPlanCard {
  plan: DietPlan;
  itemCount: number;
}

@Component({
  selector: 'app-dieta',
  standalone: true,
  imports: [IonButton, IonAvatar, IonBadge, IonLabel, IonListHeader, ...IONIC_LIST, ...IONIC_PAGE, ...IONIC_LINKS, CommonModule, IconaComponent],
  templateUrl: './dieta.component.html'
})
export class DietaComponent implements OnInit {
  cards: DietPlanCard[] = [];

  private readonly giorno = inject(GiornoService);
  /**
   * I pasti segnati del giorno salvato, col suo giorno. E' un signal perche'
   * arriva da una lettura asincrona: un campo semplice cambiato dopo un await non
   * farebbe ridisegnare la pagina (l'app non usa zone.js).
   */
  private readonly segnati = signal<{ date: string; done: Record<string, boolean> } | null>(null);
  /**
   * I pasti segnati come fatti oggi (id del pasto -> fatto): quelli salvati, se
   * sono di oggi. A mezzanotte tornano vuoti da soli, anche a pagina aperta.
   */
  private readonly fattiOggi = computed(() => {
    const s = this.segnati();
    return s && s.date === this.giorno.oggi() ? s.done : {};
  });

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
      this.segnati.set(c ? { date: c.date, done: { ...c.done } } : null);
    } catch {
      // Senza lo stato la card resta senza avanzamento, non senza piani.
      this.segnati.set(null);
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

  // --- La dieta ciclica (vedi dieta-ciclo.util) ---

  /** I piani vanno in fila col calendario. Con ON/OFF la pagina resta com'era: nessun piano "di oggi". */
  get ciclica(): boolean {
    return this.dietData.ciclo().tipo === 'ciclica';
  }

  /** Dove si e' nel ciclo oggi. Legge il giorno dal signal: a mezzanotte passa da solo al piano dopo. */
  posizione(): PosizioneCiclo | null {
    return posizioneNelCiclo(this.dietData.ciclo(), this.cards.length, this.giorno.oggi());
  }

  /** Il piano in posizione i e' quello di oggi. */
  diOggi(i: number): boolean {
    const p = this.posizione();
    return p?.stato === 'oggi' && p.indice === i;
  }

  /** "ciclo di 3 giorni", accanto all'intestazione. */
  get durataCiclo(): string {
    return `ciclo di ${this.cards.length} ${this.cards.length === 1 ? 'giorno' : 'giorni'}`;
  }

  /** La riga sotto i piani: cosa tocca domani, quando comincia il ciclo, o cosa manca. */
  notaCiclo(): string | null {
    if (!this.ciclica || !this.cards.length) return null;
    const p = this.posizione();
    if (!p) return 'Manca il primo giorno del ciclo: si sceglie nel protocollo, nella Dieta del builder.';
    if (p.stato === 'non-iniziato') return `Il ciclo comincia ${dataEstesa(p.inizio)}, col primo piano.`;
    if (this.cards.length === 1) return null;
    const domani = this.cards[p.domani].plan.name;
    return p.domani === 0
      ? `Domani si riparte dal primo: ${domani}.`
      : `Domani tocca ${domani}.`;
  }

  get hasAnyDietData(): boolean {
    return this.cards.length > 0;
  }

  openCard(card: DietPlanCard): void {
    this.nav.navigateForward(['/dieta', card.plan.id]);
  }
}
