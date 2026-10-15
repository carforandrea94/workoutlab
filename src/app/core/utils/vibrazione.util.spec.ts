import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Ambiente, vibra } from './vibrazione.util';

/**
 * Su iPhone navigator.vibrate non esiste: il segnale di fine recupero passa
 * dall'aptico nell'app nativa e dal browser altrove. L'ambiente si passa a
 * mano: niente mock di moduli, che nel sistema di test di Angular non reggono.
 */
describe('vibra', () => {
  let aptico: { notification: ReturnType<typeof vi.fn>; impact: ReturnType<typeof vi.fn> };
  let vibrate: ReturnType<typeof vi.fn>;

  const ambiente = (parti: Partial<Ambiente>): Ambiente =>
    ({ nativa: false, aptico: aptico as any, vibrate: vibrate as any, ...parti });

  beforeEach(() => {
    aptico = { notification: vi.fn(async () => {}), impact: vi.fn(async () => {}) };
    vibrate = vi.fn(() => true);
  });

  describe('nel browser', () => {
    it('a fine recupero fa la vibrazione doppia', () => {
      vibra('fine-recupero', ambiente({}));
      expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
      expect(aptico.notification).not.toHaveBeenCalled();
    });

    it('a fine pausa fa una vibrazione sola', () => {
      vibra('fine-pausa', ambiente({}));
      expect(vibrate).toHaveBeenCalledWith(200);
    });

    it('alla serie confermata fa un tocco brevissimo, piu\' leggero degli avvisi', () => {
      vibra('serie', ambiente({}));
      expect(vibrate).toHaveBeenCalledWith(15);
    });

    it('dove navigator.vibrate non c\'e\' (iPhone) non fa niente e non si rompe', () => {
      expect(() => vibra('fine-recupero', ambiente({ vibrate: null }))).not.toThrow();
      expect(aptico.notification).not.toHaveBeenCalled();
      expect(aptico.impact).not.toHaveBeenCalled();
    });
  });

  describe('nell\'app nativa', () => {
    it('a fine recupero manda la notifica di successo', () => {
      vibra('fine-recupero', ambiente({ nativa: true }));
      expect(aptico.notification).toHaveBeenCalledWith({ type: NotificationType.Success });
      expect(vibrate).not.toHaveBeenCalled();
    });

    it('a fine pausa manda un colpo medio', () => {
      vibra('fine-pausa', ambiente({ nativa: true }));
      expect(aptico.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium });
      expect(vibrate).not.toHaveBeenCalled();
    });

    it('alla serie confermata manda un colpo leggero, non medio', () => {
      vibra('serie', ambiente({ nativa: true }));
      expect(aptico.impact).toHaveBeenCalledWith({ style: ImpactStyle.Light });
      expect(aptico.notification).not.toHaveBeenCalled();
    });

    it('se l\'aptico rifiuta non e\' un errore per chi chiama', async () => {
      aptico.notification.mockRejectedValueOnce(new Error('non disponibile'));
      expect(() => vibra('fine-recupero', ambiente({ nativa: true }))).not.toThrow();
      await Promise.resolve();
    });
  });
});
