import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MeasureCategory, CATEGORY_FIELDS, CATEGORY_LABELS, CATEGORY_UNIT_BADGE, MeasurementEntry } from '../../models/measurement.model';
import { MeasurementDataService } from '../../services/measurement-data.service';
import { quandoBreve } from '../../core/utils/date.util';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonButton } from '@ionic/angular';
import { LucideAngularModule } from 'lucide-angular';

interface CategoryTile {
  id: MeasureCategory;
  label: string;
  badge: string;
}

/**
 * La riga di una categoria: il peso con la sua ultima pesata, le altre con
 * l'ultima volta in cui sono state misurate. Prima ogni riga era solo il nome,
 * e per sapere quando ci si era pesati si doveva entrare.
 */
export function riassuntoCategoria(categoria: MeasureCategory, storico: MeasurementEntry[], oggiISO?: string): string {
  const campi = CATEGORY_FIELDS[categoria];
  // `storico` e' dal piu' recente.
  const ultima = storico.find(e => campi.some(f => !!e[f.key]));
  if (!ultima) return 'Nessuna misura';
  const quando = quandoBreve(ultima.date, oggiISO);
  if (categoria === 'peso') return `${ultima.peso} kg · ${quando}`;
  return `Ultima volta: ${quando}`;
}

@Component({
  selector: 'app-misure',
  standalone: true,
  imports: [IonButton, ...IONIC_LIST, ...IONIC_PAGE, ...IONIC_LINKS, LucideAngularModule, CommonModule],
  templateUrl: './misure.component.html'
})
export class MisureComponent implements OnInit {
  categories: CategoryTile[] = (['peso', 'centimetri', 'pliche'] as MeasureCategory[]).map(id => ({
    id,
    label: CATEGORY_LABELS[id],
    badge: CATEGORY_UNIT_BADGE[id]
  }));

  /**
   * La riga di riepilogo di ogni categoria. E' un signal perche' arriva da una
   * lettura asincrona (l'app non usa zone.js). null: non si e' potuto leggere, e
   * la riga resta senza riepilogo invece di dire "nessuna misura" a torto.
   */
  private readonly riepilogo = signal<Partial<Record<MeasureCategory, string>> | null>(null);

  constructor(private nav: NavController, private data: MeasurementDataService) {}

  ngOnInit(): void {
    void this.carica();
  }

  /** Pagina viva nella pila: dopo un salvataggio si torna qui e la riga deve dirlo. */
  ionViewWillEnter(): void {
    void this.carica();
  }

  private async carica(): Promise<void> {
    try {
      const storico = await this.data.loadHistory();
      const r: Partial<Record<MeasureCategory, string>> = {};
      for (const c of this.categories) r[c.id] = riassuntoCategoria(c.id, storico);
      this.riepilogo.set(r);
    } catch {
      this.riepilogo.set(null);
    }
  }

  riassunto(id: MeasureCategory): string | null {
    return this.riepilogo()?.[id] ?? null;
  }

  goTo(id: MeasureCategory): void {
    this.nav.navigateForward(['/misure', id]);
  }
}
