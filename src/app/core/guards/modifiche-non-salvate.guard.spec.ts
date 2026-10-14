import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { vi } from 'vitest';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { ConModificheNonSalvate, pilaDi, uscitaSenzaPerdite } from './modifiche-non-salvate.guard';

/**
 * Uscire da una pagina con modifiche non salvate chiede conferma, tranne
 * quando la pagina non va persa: cambiando tab resta nella sua pila.
 */
describe('uscitaSenzaPerdite', () => {
  const rotta = {} as ActivatedRouteSnapshot;
  const stato = (url: string) => ({ url } as RouterStateSnapshot);

  let conferma: ReturnType<typeof vi.fn>;

  const pagina = (modificata: boolean): ConModificheNonSalvate => ({ haModificheNonSalvate: () => modificata });

  const prova = (modificata: boolean, da: string, a: string) =>
    TestBed.runInInjectionContext(() => uscitaSenzaPerdite(pagina(modificata), rotta, stato(da), stato(a))) as boolean | Promise<boolean>;

  beforeEach(() => {
    conferma = vi.fn(async () => true);
    TestBed.configureTestingModule({
      providers: [{ provide: ConfirmDialogService, useValue: { confirm: conferma } }]
    });
  });

  it('senza modifiche passa senza chiedere', async () => {
    expect(await prova(false, '/corsa/nuova', '/corsa')).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
  });

  it('con modifiche, restando nella stessa tab, chiede con il tasto rosso', async () => {
    await prova(true, '/corsa/nuova', '/corsa');
    expect(conferma).toHaveBeenCalledTimes(1);
    expect(conferma.mock.calls[0][1]).toEqual({ confirmLabel: 'Esci senza salvare', dangerous: true });
  });

  it('esce se si conferma', async () => {
    conferma.mockResolvedValueOnce(true);
    expect(await prova(true, '/corsa/nuova', '/corsa')).toBe(true);
  });

  it('resta se non si conferma', async () => {
    conferma.mockResolvedValueOnce(false);
    expect(await prova(true, '/corsa/nuova', '/corsa')).toBe(false);
  });

  it('cambiando tab non chiede: la pagina resta nella sua pila', async () => {
    expect(await prova(true, '/scheda/protocolli/builder/abc', '/dieta')).toBe(true);
    expect(conferma).not.toHaveBeenCalled();
  });

  it('andare avanti nella stessa tab chiede ugualmente', async () => {
    await prova(true, '/scheda/protocolli/builder/abc', '/scheda/protocolli/aggiorna-pdf/abc');
    expect(conferma).toHaveBeenCalledTimes(1);
  });

  it('pilaDi legge il primo segmento e ignora parametri e frammento', () => {
    expect(pilaDi('/scheda/day/2?x=1')).toBe('scheda');
    expect(pilaDi('/misure#top')).toBe('misure');
    expect(pilaDi('/')).toBe('');
  });
});
