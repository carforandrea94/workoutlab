import { Component, OnInit, ChangeDetectorRef, ElementRef, ViewChild, effect } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DietDataService } from '../../services/diet-data.service';
import { DietStateService } from '../../services/diet-state.service';
import { AppStateService } from '../../services/app-state.service';
import { findClosestSlideIndex, scrollToSlide } from '../../core/utils/horizontal-slider.util';
import { firstUncompletedIndex } from '../../core/utils/meal-completion.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { DietPlan, NamedMeal, MealCombination, FoodItem, FoodCategory, FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../../models/diet.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { TastoDirective } from '../../core/tasto.directive';
import { NavController, IonSegment, IonSegmentButton, IonSelect, IonSelectOption } from '@ionic/angular';

interface MealVM {
  meal: NamedMeal;
  open: boolean;
  selectedComboId: string;
  completed: boolean;
}

@Component({
  selector: 'app-dieta-detail',
  standalone: true,
  imports: [IonSegment, IonSegmentButton, IonSelect, IonSelectOption, ...IONIC_PAGE, CommonModule, FormsModule, LucideAngularModule, TastoDirective],
  templateUrl: './dieta-detail.component.html'
})
export class DietaDetailComponent implements OnInit {
  plan: DietPlan | null = null;
  meals: MealVM[] = [];

  readonly foodCategories = FOOD_CATEGORIES;
  readonly foodCategoryLabels = FOOD_CATEGORY_LABELS;

  sliderIndex = 0;
  private scrollTicking = false;

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

    this.meals = this.plan.meals.map(meal => ({
      meal,
      open: true,
      selectedComboId: meal.combinations[0]?.id ?? '',
      completed: false
    }));

    const appState = await this.appState.load();
    const completion = appState.mealsCompletion;
    if (completion && completion.date === todayLocalISO()) {
      this.meals.forEach(vm => { vm.completed = !!completion.done[vm.meal.id]; });
    }

    this.sliderIndex = firstUncompletedIndex(this.meals);
    this.scrollToIndex(this.sliderIndex);
    this.cdr.detectChanges();
  }

  toggleMeal(vm: MealVM): void {
    vm.open = !vm.open;
  }

  hasMultipleCombinations(vm: MealVM): boolean {
    return vm.meal.combinations.length > 1;
  }

  getCombinations(vm: MealVM): MealCombination[] {
    return vm.meal.combinations;
  }

  getActiveCombo(vm: MealVM): MealCombination {
    return vm.meal.combinations.find(c => c.id === vm.selectedComboId) ?? vm.meal.combinations[0];
  }

  comboItem(vm: MealVM, cat: FoodCategory): FoodItem | null {
    return this.getActiveCombo(vm)[cat];
  }

  // --- Alternative dell'alimento della combinazione (item.alt) ---
  private itemAltOpen = new Set<string>();

  isItemAltOpen(vm: MealVM, cat: FoodCategory): boolean {
    return this.itemAltOpen.has(`${vm.meal.id}:${vm.selectedComboId}:${cat}`);
  }

  toggleItemAlt(vm: MealVM, cat: FoodCategory): void {
    const key = `${vm.meal.id}:${vm.selectedComboId}:${cat}`;
    if (this.itemAltOpen.has(key)) this.itemAltOpen.delete(key);
    else this.itemAltOpen.add(key);
  }

  // --- Alternative per macro a livello di pasto (un unico accordion 'Alternative') ---
  totalAlternatives(vm: MealVM): number {
    return this.foodCategories.reduce((acc, cat) => acc + vm.meal.alternatives[cat].length, 0);
  }

  macroAlternatives(vm: MealVM, cat: FoodCategory): FoodItem[] {
    return vm.meal.alternatives[cat];
  }

  private macroAltExpanded = new Set<string>();

  isMacroAltExpanded(vm: MealVM): boolean {
    return this.macroAltExpanded.has(vm.meal.id);
  }

  toggleMacroAltExpanded(vm: MealVM): void {
    if (this.macroAltExpanded.has(vm.meal.id)) this.macroAltExpanded.delete(vm.meal.id);
    else this.macroAltExpanded.add(vm.meal.id);
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

  toggleMealCompleted(vm: MealVM): void {
    vm.completed = !vm.completed;
    const done: Record<string, boolean> = {};
    this.meals.forEach(m => { done[m.meal.id] = m.completed; });
    this.appState.patchField('mealsCompletion', { date: todayLocalISO(), done }).catch(() => { /* gia' segnalato da AppStateService */ });
  }
}
