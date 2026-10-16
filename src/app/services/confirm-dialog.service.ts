import { Injectable } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular';

/**
 * Le conferme dell'app, nella forma che prevede iOS: chi sta per perdere
 * qualcosa vede un foglio dal basso (ion-action-sheet) con il tasto rosso e
 * "Annulla" separato; chi deve solo decidere se andare avanti vede un avviso
 * (ion-alert) con il messaggio per intero. Ionic pensa a backdrop, focus e
 * animazione. Chi chiama continua a ricevere una promessa con true/false.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  constructor(private alerts: AlertController, private sheets: ActionSheetController) {}

  /**
   * @param opts.confirmLabel Testo del bottone di conferma. Default 'Elimina'
   *   (quasi tutte le conferme nell'app sono eliminazioni); per conferme non
   *   distruttive (es. "Continuare?") va passato un testo pertinente.
   * @param opts.cancelLabel Testo di chi rinuncia. Default 'Annulla'; quando la
   *   conferma stessa parla di annullare (una sessione, un'importazione) i due
   *   tasti si leggono come lo stesso gesto: li' serve un verbo diverso
   *   ("Continua l'allenamento").
   * @param opts.dangerous Azione che fa perdere qualcosa (default): foglio
   *   dal basso con il tasto rosso. Altrimenti un avviso con il tasto
   *   d'accento: e' la strada per le domande "vuoi andare avanti?", dove il
   *   messaggio e' il contenuto e un titolo di foglio lo stringerebbe.
   */
  async confirm(message: string, opts?: { confirmLabel?: string; cancelLabel?: string; dangerous?: boolean }): Promise<boolean> {
    const dangerous = opts?.dangerous ?? true;
    const confirmLabel = opts?.confirmLabel ?? 'Elimina';
    const cancelLabel = opts?.cancelLabel ?? 'Annulla';

    const overlay = dangerous
      ? await this.sheets.create({
          header: message,
          cssClass: 'confirm-sheet',
          buttons: [
            { text: confirmLabel, role: 'destructive' },
            { text: cancelLabel, role: 'cancel' }
          ]
        })
      : await this.alerts.create({
          message,
          cssClass: 'confirm-alert',
          buttons: [
            { text: cancelLabel, role: 'cancel' },
            { text: confirmLabel, role: 'confirm' }
          ]
        });

    await overlay.present();
    const { role } = await overlay.onDidDismiss();
    // Toccare lo sfondo chiude con role 'backdrop': e' un "no", non una conferma.
    return role === 'destructive' || role === 'confirm';
  }
}
