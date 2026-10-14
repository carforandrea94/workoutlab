import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { ProtocolService } from '../../services/protocol.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-protocollo-nuovo',
  standalone: true,
  imports: [...IONIC_PAGE, CommonModule, LucideAngularModule],
  templateUrl: './protocollo-nuovo.component.html'
})
export class ProtocolloNuovoComponent {
  creating = false;

  constructor(
    private nav: NavController,
    private protocolSvc: ProtocolService
  ) {}

  async createManual(): Promise<void> {
    if (this.creating) return;
    this.creating = true;
    try {
      const id = await this.protocolSvc.create();
      this.nav.navigateForward(['/scheda/protocolli/builder', id]);
    } finally {
      this.creating = false;
    }
  }

  goToPdfImport(): void {
    this.nav.navigateForward(['/scheda/protocolli/importa-pdf']);
  }
}
