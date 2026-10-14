import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * Le conferme prendono la forma che iOS prevede: chi perde qualcosa vede un
 * foglio dal basso con il tasto rosso, chi deve solo decidere se andare avanti
 * vede un avviso.
 */
function overlayFinto(role: string) {
  return { present: vi.fn(async () => {}), onDidDismiss: vi.fn(async () => ({ role })) };
}

function servizio(ruoloChiusura: string) {
  const overlay = overlayFinto(ruoloChiusura);
  const alerts = { create: vi.fn(async () => overlay) };
  const sheets = { create: vi.fn(async () => overlay) };
  return { service: new ConfirmDialogService(alerts as any, sheets as any), alerts, sheets, overlay };
}

describe('ConfirmDialogService — azioni che fanno perdere qualcosa', () => {
  it('di default e\' un foglio dal basso: messaggio come titolo, tasto rosso e Annulla', async () => {
    const { service, alerts, sheets } = servizio('destructive');

    await service.confirm('Eliminare questa seduta dallo storico?');

    expect(alerts.create).not.toHaveBeenCalled();
    expect(sheets.create).toHaveBeenCalledTimes(1);
    const opzioni = (sheets.create.mock.calls[0] as any[])[0];
    expect(opzioni.header).toBe('Eliminare questa seduta dallo storico?');
    expect(opzioni.buttons).toEqual([
      { text: 'Elimina', role: 'destructive' },
      { text: 'Annulla', role: 'cancel' }
    ]);
  });

  it('il testo del tasto rosso si sceglie', async () => {
    const { service, sheets } = servizio('destructive');

    await service.confirm('Vuoi togliere questa serie?', { confirmLabel: 'Togli la serie', dangerous: true });

    expect((sheets.create.mock.calls[0] as any[])[0].buttons[0]).toEqual({ text: 'Togli la serie', role: 'destructive' });
  });

  it('il tasto rosso conferma', async () => {
    expect(await servizio('destructive').service.confirm('Eliminare?')).toBe(true);
  });

  it('Annulla non conferma', async () => {
    expect(await servizio('cancel').service.confirm('Eliminare?')).toBe(false);
  });

  it('toccare lo sfondo e\' un no, non una conferma', async () => {
    expect(await servizio('backdrop').service.confirm('Eliminare?')).toBe(false);
  });
});

describe('ConfirmDialogService — domande su cui andare avanti', () => {
  it('senza perdite e\' un avviso, con il messaggio per intero', async () => {
    const { service, alerts, sheets } = servizio('confirm');

    await service.confirm('Mancano 2 serie da spuntare. Vuoi salvare lo stesso l\'allenamento?', {
      confirmLabel: 'Salva lo stesso', dangerous: false
    });

    expect(sheets.create).not.toHaveBeenCalled();
    const opzioni = (alerts.create.mock.calls[0] as any[])[0];
    expect(opzioni.message).toContain('Mancano 2 serie');
    expect(opzioni.buttons).toEqual([
      { text: 'Annulla', role: 'cancel' },
      { text: 'Salva lo stesso', role: 'confirm' }
    ]);
  });

  it('il tasto di conferma conferma, Annulla e sfondo no', async () => {
    const opts = { confirmLabel: 'Continua', dangerous: false };
    expect(await servizio('confirm').service.confirm('Continuare?', opts)).toBe(true);
    expect(await servizio('cancel').service.confirm('Continuare?', opts)).toBe(false);
    expect(await servizio('backdrop').service.confirm('Continuare?', opts)).toBe(false);
  });
});
