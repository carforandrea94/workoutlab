import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DietDataService } from '../../services/diet-data.service';
import { AppStateService } from '../../services/app-state.service';
import { FoodItem } from '../../models/diet.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_SLIDING } from '../../core/ionic-sliding';
import {
  IonAccordion, IonAccordionGroup, IonCheckbox, IonInput, IonLabel, IonProgressBar, IonSearchbar, IonSpinner,
  IonButton
} from '@ionic/angular';
import { NomeCampoDirective } from '../../core/nome-campo.directive';
import { IconaComponent } from '../../components/icona/icona.component';

/** Il macro sotto cui l'alimento compare nella dieta. */
export type Macro = 'carb' | 'protein' | 'fat';

/**
 * Una voce della lista: il nome, e basta.
 *
 * Grammature, pasti di provenienza e note del coach stavano qui e non ci
 * stanno piu'. Questa lista si legge in piedi al supermercato: serve sapere
 * cosa prendere e cosa e' gia' nel carrello. Quanto pesarne lo dice la dieta,
 * al momento di cucinare, dove quel numero ha un senso - sul banco del pesce
 * "300 g + 250 g" era solo una riga in piu' da scavalcare.
 */
export interface ShoppingItem {
  key: string;
  name: string;
  cat: Macro;
  checked: boolean;
}

interface CustomShoppingItem {
  id: string;
  name: string;
  checked: boolean;
}

/** Un reparto della lista: gli alimenti ancora da prendere, e quanti ne mancano. */
export interface ShoppingGroup {
  key: Macro;
  label: string;
  daPrendere: ShoppingItem[];
  presi: number;
  totale: number;
}

const MACRO: { key: Macro; label: string }[] = [
  { key: 'carb', label: 'Carboidrati' },
  { key: 'protein', label: 'Proteine' },
  { key: 'fat', label: 'Grassi' }
];

@Component({
  selector: 'app-lista-spesa',
  standalone: true,
  imports: [NomeCampoDirective, IonButton,
    IonAccordion, IonAccordionGroup, IonCheckbox, IonInput, IonLabel, IonProgressBar, IonSearchbar, IonSpinner,
    ...IONIC_PAGE, ...IONIC_SLIDING, CommonModule, FormsModule, IconaComponent],
  templateUrl: './lista-spesa.component.html'
})
export class ListaSpesaComponent implements OnInit {
  items: ShoppingItem[] = [];
  customItems: CustomShoppingItem[] = [];
  newItemName = '';

  /** Quello che si sta cercando. Con cinquanta voci, scorrere per trovare
   *  "Calamaro" e' piu' lungo che scriverlo. */
  query = '';

  loading = true;
  errorMsg = '';

  /** Il carrello e' chiuso: quello che conta e' cosa manca. */
  cartOpen = false;

  get totalCount(): number {
    return this.items.length + this.customItems.length;
  }

  get checkedCount(): number {
    return this.items.filter(i => i.checked).length + this.customItems.filter(i => i.checked).length;
  }

  /** Quanto della spesa e' fatta, da 0 a 100. */
  get progress(): number {
    return this.totalCount === 0 ? 0 : Math.round(this.checkedCount / this.totalCount * 100);
  }

  get filtroAttivo(): boolean {
    return this.query.trim().length > 0;
  }

  /**
   * Senza accenti e senza maiuscole: chi cerca "caffe" sul telefono deve
   * trovare "Caffè", perche' l'accento sulla tastiera e' un tasto tenuto
   * premuto e nessuno lo fa mentre spinge un carrello.
   */
  private norm(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /** Se l'alimento rientra nella ricerca in corso. Senza ricerca, passano tutti. */
  private trovato(name: string): boolean {
    return !this.filtroAttivo || this.norm(name).includes(this.norm(this.query));
  }

  /** Quante voci risponderebbero alla ricerca, carrello compreso. */
  get risultati(): number {
    return this.groups.reduce((n, g) => n + g.daPrendere.length, 0)
      + this.customDaPrendere.length + this.itemsPresi.length + this.customPresi.length;
  }

  /**
   * I reparti, con dentro solo quello che manca. Raggruppare per macro non e'
   * raggruppare per corsia, ma ci somiglia - pane e riso, banco del fresco,
   * olio e frutta secca - e soprattutto e' un dato che la dieta ha gia': una
   * tabella alimento-reparto andrebbe scritta e tenuta aggiornata a mano.
   */
  get groups(): ShoppingGroup[] {
    return MACRO.map(m => {
      const tutti = this.items.filter(i => i.cat === m.key);
      return {
        key: m.key,
        label: m.label,
        daPrendere: tutti.filter(i => !i.checked && this.trovato(i.name)),
        // Presi e totale raccontano il reparto, non la ricerca: restano pieni
        // anche mentre si cerca, altrimenti "1 / 14" diventerebbe "1 / 1".
        presi: tutti.filter(i => i.checked).length,
        totale: tutti.length
      };
    }).filter(g => g.totale > 0);
  }

  /** Gli alimenti aggiunti a mano, ancora da prendere. */
  get customDaPrendere(): CustomShoppingItem[] {
    return this.customItems.filter(i => !i.checked && this.trovato(i.name));
  }

  get itemsPresi(): ShoppingItem[] {
    return this.items.filter(i => i.checked && this.trovato(i.name));
  }

  get customPresi(): CustomShoppingItem[] {
    return this.customItems.filter(i => i.checked && this.trovato(i.name));
  }

  /**
   * Il carrello si apre da solo quando la ricerca trova qualcosa li' dentro:
   * un alimento che risponde ma resta nascosto in una sezione chiusa si
   * legge come "non ce l'hai", e lo si ricompra.
   */
  get carrelloAperto(): boolean {
    return this.cartOpen || (this.filtroAttivo && this.itemsPresi.length + this.customPresi.length > 0);
  }

  /** Si cercava qualcosa e non c'e' niente: diverso da una lista vuota. */
  get nessunRisultato(): boolean {
    return this.filtroAttivo && this.totalCount > 0 && this.risultati === 0;
  }

  /** Aggiunge alla lista quello che si stava cercando senza trovarlo. */
  aggiungiCercato(): void {
    this.newItemName = this.query.trim();
    this.addCustomItem();
    this.query = '';
  }

  constructor(
    private dietData: DietDataService,
    private appState: AppStateService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const appState = await Promise.race([this.appState.load(), timeout]);
      this.buildItems(appState.shoppingChecked ?? {});
      this.customItems = appState.shoppingCustomItems ?? [];
    } catch (e: any) {
      console.error('Errore caricamento lista della spesa:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento della lista. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private buildItems(checked: Record<string, boolean>): void {
    const map = new Map<string, ShoppingItem>();

    const addFood = (food: FoodItem | null, cat: Macro) => {
      if (!food || !food.name) return;
      const key = food.name.trim().toLowerCase();
      // Lo stesso alimento in piu' pasti e' una voce sola: al supermercato si
      // compra una volta. Il macro e' quello sotto cui compare per primo.
      if (!map.has(key)) {
        map.set(key, { key, name: food.name.trim(), cat, checked: !!checked[this.safeKey(key)] });
      }

      // Alternative annidate del singolo alimento (item.alt, es. "Farina d'avena" ->
      // "Farina di riso"), popolate dal coach builder e dall'import PDF: senza questo
      // giro mancavano dalla lista tutte le alternative-per-alimento, distinte dalle
      // alternative-per-macro del pasto (meal.alternatives) gia' incluse sopra.
      (food.alt ?? []).forEach(alt => addFood(alt as FoodItem, cat));
    };

    for (const plan of this.dietData.diet) {
      for (const meal of plan.meals) {
        for (const combo of meal.combinations) {
          addFood(combo.carb, 'carb');
          addFood(combo.protein, 'protein');
          addFood(combo.fat, 'fat');
        }
        (['carb', 'protein', 'fat'] as const).forEach(cat => {
          meal.alternatives[cat].forEach(food => addFood(food, cat));
        });
      }
    }

    this.items = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  toggle(item: ShoppingItem): void {
    item.checked = !item.checked;
    this.appState.patchField(`shoppingChecked.${this.safeKey(item.key)}`, item.checked).catch(() => { /* gia' segnalato da AppStateService */ });
  }

  toggleCart(): void {
    this.cartOpen = !this.cartOpen;
  }

  /** L'accordion dice se l'utente l'ha aperto o chiuso: il carrello lo segue. */
  impostaCarrello(aperto: boolean): void {
    this.cartOpen = aperto;
  }

  private safeKey(key: string): string {
    return key.replace(/[.\[\]\/]/g, '_');
  }

  addCustomItem(): void {
    const name = this.newItemName.trim();
    if (!name) return;
    this.customItems.push({ id: `${Date.now()}_${Math.floor(Math.random() * 1000)}`, name, checked: false });
    this.newItemName = '';
    this.appState.patch({ shoppingCustomItems: this.customItems });
  }

  toggleCustom(item: CustomShoppingItem): void {
    item.checked = !item.checked;
    this.appState.patch({ shoppingCustomItems: this.customItems });
  }

  removeCustom(item: CustomShoppingItem, event: MouseEvent): void {
    event.stopPropagation();
    this.customItems = this.customItems.filter(i => i.id !== item.id);
    this.appState.patch({ shoppingCustomItems: this.customItems });
  }

  async resetAll(): Promise<void> {
    this.items.forEach(i => { i.checked = false; });
    this.customItems.forEach(i => { i.checked = false; });
    this.cartOpen = false;
    await this.appState.patch({ shoppingChecked: {}, shoppingCustomItems: this.customItems });
  }
}
