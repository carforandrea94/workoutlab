import { describe, expect, it, vi } from 'vitest';
import { conDissolvenza } from './dissolvenza';

/** Elenco e slider si scambiano con una dissolvenza incrociata, dove c'e'. */
describe('conDissolvenza', () => {
  function documento(opz: { transizione?: boolean; ridotto?: boolean }) {
    const startViewTransition = vi.fn((fn: () => void) => { fn(); return {}; });
    const doc = {
      defaultView: { matchMedia: (q: string) => ({ matches: !!opz.ridotto && q.includes('reduce') }) },
      ...(opz.transizione ? { startViewTransition } : {})
    } as unknown as Document;
    return { doc, startViewTransition };
  }

  it('dove c\'e\' la transizione, il cambio avviene dentro di lei', () => {
    const { doc, startViewTransition } = documento({ transizione: true });
    const cambia = vi.fn();
    conDissolvenza(cambia, doc);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(cambia).toHaveBeenCalledTimes(1);
  });

  it('senza transizione cambia di colpo, come prima', () => {
    const { doc } = documento({});
    const cambia = vi.fn();
    conDissolvenza(cambia, doc);
    expect(cambia).toHaveBeenCalledTimes(1);
  });

  it('con "riduci movimento" cambia di colpo anche dove la transizione c\'e\'', () => {
    const { doc, startViewTransition } = documento({ transizione: true, ridotto: true });
    const cambia = vi.fn();
    conDissolvenza(cambia, doc);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(cambia).toHaveBeenCalledTimes(1);
  });
});
