import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MeasureCategory, CATEGORY_LABELS, CATEGORY_UNIT_BADGE } from '../../models/measurement.model';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonButton } from '@ionic/angular';
import { LucideAngularModule } from 'lucide-angular';

interface CategoryTile {
  id: MeasureCategory;
  label: string;
  badge: string;
}

@Component({
  selector: 'app-misure',
  standalone: true,
  imports: [IonButton, ...IONIC_LIST, ...IONIC_PAGE, ...IONIC_LINKS, LucideAngularModule, CommonModule],
  templateUrl: './misure.component.html'
})
export class MisureComponent {
  categories: CategoryTile[] = (['peso', 'centimetri', 'pliche'] as MeasureCategory[]).map(id => ({
    id,
    label: CATEGORY_LABELS[id],
    badge: CATEGORY_UNIT_BADGE[id]
  }));

  constructor(private nav: NavController) {}

  goTo(id: MeasureCategory): void {
    this.nav.navigateForward(['/misure', id]);
  }
}
