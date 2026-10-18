import { Component, OnInit, ChangeDetectorRef, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DietDataService } from '../../services/diet-data.service';
import { DietStateService } from '../../services/diet-state.service';
import { AppStateService } from '../../services/app-state.service';
import { findClosestSlideIndex, scrollToSlide } from '../../core/utils/horizontal-slider.util';
import { firstUncompletedIndex } from '../../core/utils/meal-completion.util';
import { todayLocalISO } from '../../core/utils/date.util';
import {
  AlimentoScelto, OpzioniMacro, SceltaPasto, alimentoScelto, comboDi, conCombo, conMacro,
  contaAlternative, daValoreMacro, normalizzaScelta, opzioniMacro, riassuntoCombo, valoreMacro
} from '../../core/utils/scelta-pasto.util';
import { DietPlan, NamedMeal, MealCombination, FoodCategory, FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../../models/diet.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { TastoDirective } from '../../core/tasto.directive';
import {
  NavController, IonSegment, IonSegmentButton, IonButton, IonFooter, IonModal, IonRadioGroup, IonRadio,
  IonItem, IonProgressBar
} from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';

interface MealVM {
  meal: NamedMeal;
  open: boolean;
  completed: boolean;
  /** Cosa si e' scelto oggi; assente = il piano com'e'. */
  scelta?: SceltaPasto;
}

/** Il foglio dal basso aperto: la combinazione di un pasto, o le alternative di un macro. */
type Foglio = { tipo: 'combo'; vm: MealVM } | { tipo: 'macro'; vm: MealVM; cat: FoodCategory };

@Component({
  selector: 'app-dieta-detail',
  standalone: true,
  imports: [
    IonSegment, IonSegmentButton, IonButton, IonFooter, IonModal, IonRadioGroup, IonRadio, IonItem, IonProgressBar,
    ...IONIC_PAGE, CommonModule, IconaComponent, TastoDirective
  ],
  templateUrl: './dieta-detail.component.html'
})
export class DietaDetailComponent implements OnInit {
  plan: DietPlan | null = null;
  meals: MealVM[] = [];

  readonly foodCategories = FOOD_CATEGORIES;
  readonly foodCategoryLabels = FOOD_CATEGORY_LABELS;

  sliderIndex = 0;
  private scrollTicking = false;

  /**
   * Il foglio si apre e si chiude con [isOpen]; il contenuto resta finche' non
   * e' sceso del tutto (didDismiss), o scenderebbe vuoto.
   */
  foglio: Foglio | null = null;
  foglioAperto = false;

  /**
   * Quello che e' gia' salvato per oggi sui pasti degli ALTRI piani: si salva
   * tutto insieme, e scrivere solo quelli di questo piano li cancellerebbe (chi
   * apre il Giorno OFF dopo aver segnato la colazione del Giorno ON la perdeva).
   */
  private altriFatti: Record<string, boolean> = {};
  private altreScelte: Record<string, SceltaPasto> = {};

  @ViewChild('sliderEl') sliderEl?: ElementRef<HTMLDivElement>;

  constructor(
    private route: ActivatedRoute,
    private nav: NavController,
    public dietData: DietDataService,
    public state: DietStateService,
    private appState: AppStateService,
    private cdr: ChangeDetectorRef
  ) {
    // Il toggle vive nella navbar (fuori da questa pagina): quando si passa
    // a "slider" da un'altra vista/pagina, riparte dal primo pasto non
    // ancora completato oggi (firstUncompletedIndex), non sempre dalla
    // prima card e non piu' in base alla fascia oraria corrente.
    effect(() => {
      if (this.state.viewMode() === 'slider') {
        this.sliderIndex = firstUncompletedIndex(this.meals);
        setTimeout(() => this.scrollToIndex(this.sliderIndex), 0);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('mode') ?? ''; // param storico 'mode', ora contiene l'id del piano
    this.plan = this.dietData.getPlan(id);
    if (!this.plan) { this.nav.navigateBack(['/dieta']); return; }

    this.meals = this.plan.meals.map(meal => ({ meal, open: true, completed: false }));

    const appState = await this.appState.load();
    const completion = appState.mealsCompletion;
    if (completion && completion.date === todayLocalISO()) {
      const qui = new Set(this.meals.map(vm => vm.meal.id));
      for (const [k, v] of Object.entries(completion.done ?? {})) if (!qui.has(k)) this.altriFatti[k] = v;
      for (const [k, v] of Object.entries(completion.choices ?? {})) if (!qui.has(k)) this.altreScelte[k] = v;
      this.meals.forEach(vm => {
        vm.completed = !!completion.done?.[vm.meal.id];
        vm.scelta = normalizzaScelta(vm.meal, completion.choices?.[vm.meal.id]);
      });
    }

    this.sliderIndex = firstUncompletedIndex(this.meals);
    this.scrollToIndex(this.sliderIndex);
    this.cdr.detectChanges();
  }

  // --- La giornata ---

  get fatti(): number {
    return this.meals.filter(vm => vm.completed).length;
  }

  /** Il pasto sulla card visibile dello slider: e' quello a cui si riferisce il tasto in fondo. */
  get pastoCorrente(): MealVM | null {
    return this.meals[this.sliderIndex] ?? null;
  }

  toggleMeal(vm: MealVM): void {
    vm.open = !vm.open;
  }

  toggleMealCompleted(vm: MealVM): void {
    vm.completed = !vm.completed;
    this.salva();
  }

  private salva(): void {
    const done: Record<string, boolean> = { ...this.altriFatti };
    const choices: Record<string, SceltaPasto> = { ...this.altreScelte };
    this.meals.forEach(vm => {
      done[vm.meal.id] = vm.completed;
      if (vm.scelta) choices[vm.meal.id] = vm.scelta;
    });
    const giorno = { date: todayLocalISO(), done, ...(Object.keys(choices).length ? { choices } : {}) };
    this.appState.patchField('mealsCompletion', giorno).catch(() => { /* gia' segnalato da AppStateService */ });
  }

  // --- Cosa si mangia ---

  combo(vm: MealVM): MealCombination | null {
    return comboDi(vm.meal, vm.scelta);
  }

  hasMultipleCombinations(vm: MealVM): boolean {
    return vm.meal.combinations.length > 1;
  }

  /** "2 di 3": la posizione della combinazione scelta fra quelle del pasto. */
  indiceCombo(vm: MealVM): number {
    const c = this.combo(vm);
    return c ? vm.meal.combinations.indexOf(c) + 1 : 0;
  }

  opzioni(vm: MealVM, cat: FoodCategory): OpzioniMacro {
    return opzioniMacro(vm.meal, this.combo(vm), cat);
  }

  scelto(vm: MealVM, cat: FoodCategory): AlimentoScelto | null {
    return alimentoScelto(this.opzioni(vm, cat), vm.scelta?.macro?.[cat]);
  }

  nAlternative(vm: MealVM, cat: FoodCategory): number {
    return contaAlternative(this.opzioni(vm, cat));
  }

  /** Un macro si mostra se la combinazione lo prevede o se il pasto ha alternative per lui. */
  mostraMacro(vm: MealVM, cat: FoodCategory): boolean {
    return !!this.scelto(vm, cat) || this.nAlternative(vm, cat) > 0;
  }

  riassunto(c: MealCombination): string {
    return riassuntoCombo(c);
  }

  // --- I fogli dal basso ---

  apriCombo(vm: MealVM): void {
    this.foglio = { tipo: 'combo', vm };
    this.foglioAperto = true;
  }

  apriMacro(vm: MealVM, cat: FoodCategory): void {
    this.foglio = { tipo: 'macro', vm, cat };
    this.foglioAperto = true;
  }

  foglioChiuso(): void {
    this.foglioAperto = false;
    this.foglio = null;
  }

  /** Il valore selezionato nel gruppo di radio del foglio aperto. */
  valoreFoglio(f: Foglio): string {
    if (f.tipo === 'combo') return this.combo(f.vm)?.id ?? '';
    return valoreMacro(f.vm.scelta?.macro?.[f.cat]);
  }

  /**
   * Scegliere col dito chiude il foglio: la scelta si vede subito nella card.
   * Con le frecce no: nel gruppo di radio le frecce spostano E scelgono, e chi
   * usa la tastiera deve poter scorrere le opzioni senza che il foglio gli si
   * chiuda alla prima; conferma con Spazio, o esce con Esc.
   * Cambiare combinazione riparte dal pasto intero (i cambi fatti sull'altra non valgono).
   */
  scegliNelFoglio(f: Foglio, valore: string, evento?: Event): void {
    if (f.tipo === 'combo') {
      f.vm.scelta = conCombo(f.vm.meal, valore);
    } else {
      f.vm.scelta = conMacro(f.vm.meal, f.vm.scelta, f.cat, daValoreMacro(valore));
    }
    this.salva();
    if (!(typeof KeyboardEvent !== 'undefined' && evento instanceof KeyboardEvent)) this.foglioAperto = false;
    this.cdr.detectChanges();
  }

  // --- Lo slider e il segmento dei pasti ---

  /** Dal segmento in cima: porta la card di quel pasto. */
  vaiAlPasto(id: unknown): void {
    const i = this.meals.findIndex(vm => vm.meal.id === id);
    if (i < 0 || i === this.sliderIndex) return;
    this.sliderIndex = i;
    this.scrollToIndex(i);
  }

  onSliderScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      const el = this.sliderEl?.nativeElement;
      if (!el) return;
      const closest = findClosestSlideIndex(el);
      if (closest !== this.sliderIndex) {
        this.sliderIndex = closest;
        this.cdr.detectChanges();
      }
    });
  }

  scrollToIndex(idx: number): void {
    scrollToSlide(this.sliderEl?.nativeElement, idx);
  }
}
