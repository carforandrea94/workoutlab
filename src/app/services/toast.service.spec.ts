import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new ToastService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('non mostra nessun toast prima di success()/error()', () => {
    expect(service.toast()).toBeNull();
  });

  it('success() imposta un toast di tipo success con il messaggio dato', () => {
    service.success('Allenamento salvato ✓');
    expect(service.toast()).toEqual({ kind: 'success', message: 'Allenamento salvato ✓' });
  });

  it('error() imposta un toast di tipo error con il messaggio dato', () => {
    service.error('Errore durante il salvataggio. Riprova.');
    expect(service.toast()).toEqual({ kind: 'error', message: 'Errore durante il salvataggio. Riprova.' });
  });

  it('il toast scompare da solo dopo 2500ms', () => {
    service.success('Bozza salvata ✓');
    expect(service.toast()).not.toBeNull();
    vi.advanceTimersByTime(2500);
    expect(service.toast()).toBeNull();
  });

  it('un nuovo show() prima dello scadere del precedente sostituisce il toast e riazzera il timer', () => {
    service.success('Bozza salvata ✓');
    vi.advanceTimersByTime(2000);
    service.error('Errore durante il salvataggio. Riprova.');
    vi.advanceTimersByTime(2000);
    // sono passati 4000ms totali ma solo 2000ms dal secondo show(): deve essere ancora visibile
    expect(service.toast()).toEqual({ kind: 'error', message: 'Errore durante il salvataggio. Riprova.' });
    vi.advanceTimersByTime(500);
    expect(service.toast()).toBeNull();
  });
});
