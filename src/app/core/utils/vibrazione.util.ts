import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNativeApp } from './platform.util';

/**
 * Le due vibrazioni dell'app: il telefono e' in tasca o sulla panca, non
 * davanti agli occhi, e il segnale arriva dal tatto.
 *
 * Nel browser c'e' navigator.vibrate, che pero' iOS non implementa (nemmeno
 * nella PWA sulla Home): li' non succede niente. Nell'app nativa si passa dal
 * motore aptico, che su iPhone c'e' sempre; il "vibrate" a durata del plugin
 * su iOS ignora la durata e da' un colpo secco lungo, quindi si usano gli
 * effetti di sistema, che sono quelli che l'utente conosce.
 */
export type Vibrazione = 'fine-recupero' | 'fine-pausa';

const PATTERN_WEB: Record<Vibrazione, number | number[]> = {
  'fine-recupero': [200, 100, 200],
  'fine-pausa': 200
};

export function vibra(tipo: Vibrazione): void {
  if (isNativeApp()) {
    // Nessuno aspetta l'esito: se l'aptico non c'e' (iPad, simulatore) non e' un errore.
    const effetto = tipo === 'fine-recupero'
      ? Haptics.notification({ type: NotificationType.Success })
      : Haptics.impact({ style: ImpactStyle.Medium });
    effetto.catch(() => {});
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(PATTERN_WEB[tipo]);
}
