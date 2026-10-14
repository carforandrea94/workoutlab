import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { ProtocolService } from '../../services/protocol.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Protocol } from '../../models/protocol.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import { IONIC_SLIDING } from '../../core/ionic-sliding';
import { NavController, IonSpinner } from '@ionic/angular';

/**
 * I protocolli dell'utente: scheda, dieta e obiettivo di corsa. Ne vale uno
 * solo alla volta, quello attivo, ed e' quello che si vede nelle altre sezioni.
 */
@Component({
  selector: 'app-protocolli',
  standalone: true,
  imports: [IonSpinner, ...IONIC_PAGE, ...IONIC_REFRESH, ...IONIC_SLIDING, CommonModule, LucideAngularModule],
  templateUrl: './protocolli.component.html'
})
export class ProtocolliComponent implements OnInit {
  protocols: Protocol[] = [];
  loading = true;
  errorMsg = '';
  busyId: string | null = null;

  constructor(
    private nav: NavController,
    private protocolSvc: ProtocolService,
    private confirm: ConfirmDialogService,
    private cdr: ChangeDetectorRef
  ) {}

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.load(true));
  }

  /** Ionic tiene viva la pagina nella pila: tornandoci ngOnInit non riparte, e i protocolli sono cambiati nel builder. */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) void this.load();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    this.load();
  }

  /** `silenzioso`: il gesto "tira per aggiornare" rilegge senza far sparire l'elenco dietro lo spinner. */
  async load(silenzioso = false): Promise<void> {
    if (!silenzioso) this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      this.protocols = await Promise.race([this.protocolSvc.list(), timeout]);
    } catch (e: any) {
      console.error('Errore caricamento protocolli:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  newProtocol(): void {
    this.nav.navigateForward(['/scheda/protocolli/nuovo']);
  }

  editProtocol(p: Protocol): void {
    this.nav.navigateForward(['/scheda/protocolli/builder', p.id]);
  }

  async activate(p: Protocol, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (p.status === 'active') return;
    this.busyId = p.id;
    this.cdr.detectChanges();
    try {
      await this.protocolSvc.activate(p.id);
      await this.load();
    } finally {
      this.busyId = null;
      this.cdr.detectChanges();
    }
  }

  async remove(p: Protocol, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirm.confirm(`Eliminare il protocollo "${p.name}"?`);
    if (ok) {
      await this.protocolSvc.delete(p.id);
      await this.load();
    }
  }

  statusLabel(p: Protocol): string {
    if (p.status === 'active') return 'Attivo';
    if (p.status === 'draft') return 'Bozza';
    return 'Archiviato';
  }
}
