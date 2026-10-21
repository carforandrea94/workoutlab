import { describe, expect, it, vi } from 'vitest';
import { META_SCADENZA_MS, MetaSlider, findClosestSlideIndex, scrollToSlide } from './horizontal-slider.util';

describe('slider orizzontale', () => {
  function slider(n: number, larghezza = 393, scroll = 0): HTMLElement {
    const el = document.createElement('div');
    for (let i = 0; i < n; i++) {
      const card = document.createElement('div');
      Object.defineProperty(card, 'offsetLeft', { value: i * larghezza });
      card.scrollIntoView = vi.fn();
      el.appendChild(card);
    }
    Object.defineProperty(el, 'scrollLeft', { value: scroll, writable: true });
    return el;
  }

  it('la card in vista e\' quella piu\' vicina allo scroll', () => {
    expect(findClosestSlideIndex(slider(3, 393, 0))).toBe(0);
    expect(findClosestSlideIndex(slider(3, 393, 230))).toBe(1);
    expect(findClosestSlideIndex(slider(3, 393, 760))).toBe(2);
  });

  it('col tocco scorre morbido; all\'apertura della pagina di colpo, senza un secondo movimento', () => {
    const el = slider(3);
    scrollToSlide(el, 2);
    expect((el.children[2] as HTMLElement).scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    scrollToSlide(el, 1, false);
    expect((el.children[1] as HTMLElement).scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', inline: 'center', block: 'nearest' });
    expect(() => scrollToSlide(undefined, 0)).not.toThrow();
  });

  /**
   * Toccato "Cena" dalla "Colazione", lo scorrimento passa sopra il "Pranzo":
   * il segmento non deve tornare indietro ne' fermarsi a meta' strada.
   */
  describe('la meta di un tocco', () => {
    function meta() {
      let t = 1000;
      const m = new MetaSlider(() => t);
      return { m, avanti: (ms: number) => (t += ms) };
    }

    it('senza meta conta quello che si vede', () => {
      const { m } = meta();
      expect(m.letto(0)).toBe(0);
      expect(m.letto(2)).toBe(2);
    });

    it('andando verso la meta le card di passaggio non contano; arrivati, si', () => {
      const { m } = meta();
      m.vai(2);
      expect(m.letto(0)).toBeNull();
      expect(m.letto(1)).toBeNull();
      expect(m.letto(2)).toBe(2);
      // Arrivati, la meta non c'e' piu': si torna a seguire lo scroll.
      expect(m.letto(1)).toBe(1);
    });

    it('se il dito riprende lo slider conta di nuovo quello che si vede', () => {
      const { m } = meta();
      m.vai(2);
      m.lascia();
      expect(m.letto(1)).toBe(1);
    });

    it('uno scorrimento che non arriva (interrotto) non blocca lo slider per sempre', () => {
      const { m, avanti } = meta();
      m.vai(2);
      avanti(META_SCADENZA_MS - 1);
      expect(m.letto(1)).toBeNull();
      avanti(1);
      expect(m.letto(1)).toBe(1);
      expect(m.letto(0)).toBe(0);
    });
  });
});
