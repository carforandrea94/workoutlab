import { describe, it, expect, vi } from 'vitest';
import { completaRefresh } from './ionic-page';

/**
 * Il gesto "tira per aggiornare": l'indicatore di ion-refresher si chiude
 * sempre, anche quando il caricamento fallisce. Se restasse aperto la pagina
 * sembrerebbe bloccata in alto e non si potrebbe piu' ritirare.
 */
function gesto() {
  const complete = vi.fn();
  return { ev: { target: { complete } } as unknown as Event, complete };
}

describe('completaRefresh', () => {
  it('esegue il caricamento e poi chiude l\'indicatore', async () => {
    const { ev, complete } = gesto();
    const ordine: string[] = [];
    complete.mockImplementation(() => ordine.push('chiuso'));

    await completaRefresh(ev, async () => { ordine.push('caricato'); });

    expect(ordine).toEqual(['caricato', 'chiuso']);
  });

  it('non chiude l\'indicatore finche\' il caricamento non e\' finito', async () => {
    const { ev, complete } = gesto();
    let finisci!: () => void;
    const lento = new Promise<void>(res => { finisci = res; });

    const attesa = completaRefresh(ev, () => lento);
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();

    finisci();
    await attesa;
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('chiude l\'indicatore anche se il caricamento fallisce, e l\'errore arriva a chi chiama', async () => {
    const { ev, complete } = gesto();

    await expect(completaRefresh(ev, async () => { throw new Error('rete'); })).rejects.toThrow('rete');

    expect(complete).toHaveBeenCalledTimes(1);
  });
});
