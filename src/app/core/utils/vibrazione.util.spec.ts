import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const nativa = vi.hoisted(() => ({ valore: false }));
const aptico = vi.hoisted(() => ({
  notification: vi.fn(async () => {}),
  impact: vi.fn(async () => {})
}));

vi.mock('./platform.util', () => ({ isNativeApp: () => nativa.valore }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: aptico,
  ImpactStyle: { Medium: 'MEDIUM' },
  NotificationType: { Success: 'SUCCESS' }
}));

import { vibra } from './vibrazione.util';

/**
 * Su iPhone navigator.vibrate non esiste: il segnale di fine recupero passa
 * dall'aptico nell'app nativa e dal browser altrove.
 */
describe('vibra', () => {
  const originale = Object.getOwnPropertyDescriptor(Navigator.prototype, 'vibrate');
  const vibrate = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  });

  afterEach(() => {
    delete (navigator as any).vibrate;
    if (originale) Object.defineProperty(Navigator.prototype, 'vibrate', originale);
  });

  describe('nel browser', () => {
    beforeEach(() => { nativa.valore = false; });

    it('a fine recupero fa la vibrazione doppia', () => {
      vibra('fine-recupero');
      expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
      expect(aptico.notification).not.toHaveBeenCalled();
    });

    it('a fine pausa fa una vibrazione sola', () => {
      vibra('fine-pausa');
      expect(vibrate).toHaveBeenCalledWith(200);
    });

    it('dove navigator.vibrate non c\'e\' (iPhone) non fa niente e non si rompe', () => {
      delete (navigator as any).vibrate;
      expect(() => vibra('fine-recupero')).not.toThrow();
      expect(aptico.notification).not.toHaveBeenCalled();
      expect(aptico.impact).not.toHaveBeenCalled();
    });
  });

  describe('nell\'app nativa', () => {
    beforeEach(() => { nativa.valore = true; });

    it('a fine recupero manda la notifica di successo', () => {
      vibra('fine-recupero');
      expect(aptico.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
      expect(vibrate).not.toHaveBeenCalled();
    });

    it('a fine pausa manda un colpo medio', () => {
      vibra('fine-pausa');
      expect(aptico.impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
      expect(vibrate).not.toHaveBeenCalled();
    });

    it('se l\'aptico rifiuta non e\' un errore per chi chiama', async () => {
      aptico.notification.mockRejectedValueOnce(new Error('non disponibile'));
      expect(() => vibra('fine-recupero')).not.toThrow();
      await Promise.resolve();
    });
  });
});
