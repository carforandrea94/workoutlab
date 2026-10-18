import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { providerPagina } from '../../../test-support/pagina';
import { MisuraCategoriaComponent } from './misura-categoria.component';
import { MeasurementDataService } from '../../services/measurement-data.service';
import { MeasureCategoryStateService } from '../../services/measure-category-state.service';
import { ToastService } from '../../services/toast.service';
import { dataEstesa, todayLocalISO } from '../../core/utils/date.util';

@Component({ standalone: true, template: '' })
class Vuota {}

const giorniFa = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Pesarsi: l'azione piu' frequente di Misure. Il salvataggio era una spunta senza
 * testo in alto a destra, la misura non diceva di che giorno era, e il "82" in
 * grigio nel campo si leggeva come un valore gia' scritto.
 */
describe('MisuraCategoriaComponent — la pagina vera', () => {
  async function monta(opz: { categoria?: string; modifica?: boolean; ultimi?: any; salva?: boolean } = {}) {
    const categoria = opz.categoria ?? 'peso';
    const data = {
      getLastValuesWithDate: vi.fn(async () => opz.ultimi ?? {}),
      getCategoryValues: vi.fn(async () => ({ peso: '80' })),
      loadDraft: vi.fn(async () => null),
      saveDraft: vi.fn(async () => {}),
      clearDraft: vi.fn(async () => {}),
      saveCategoryToday: vi.fn(async () => opz.salva ?? true),
      moveCategoryEntry: vi.fn(async () => 'ok'),
      parseMeasureValue: (v: string | null | undefined) => (v ? parseFloat(v.replace(',', '.')) : null),
      formatMeasureNumber: (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
    };
    const toast = { success: vi.fn(), error: vi.fn() };
    const route = {
      paramMap: of(convertToParamMap({ categoria })),
      snapshot: { queryParamMap: convertToParamMap(opz.modifica ? { date: '2026-05-01' } : {}) }
    };
    TestBed.configureTestingModule({
      imports: [MisuraCategoriaComponent],
      providers: [
        ...providerPagina([{ path: 'account/misure', component: Vuota }, { path: 'account/misure/storico/:data', component: Vuota }]),
        { provide: ActivatedRoute, useValue: route },
        { provide: MeasurementDataService, useValue: data },
        { provide: ToastService, useValue: toast }
      ]
    });
    const fixture = TestBed.createComponent(MisuraCategoriaComponent);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.loading).toBe(false));
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    const stato = TestBed.inject(MeasureCategoryStateService);
    // Si scrive come lo fa l'utente: con l'evento del campo. Cambiare `values` a mano
    // dopo il primo disegno, con il ngModel a due vie, da' NG0100.
    const scrivi = (valore: string, indice = 0) => {
      const campo = root.querySelectorAll('ion-input')[indice] as any;
      campo.value = valore;
      campo.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: valore } }));
      fixture.detectChanges();
    };
    return { fixture, root, q, data, toast, stato, scrivi, route, c: fixture.componentInstance };
  }

  describe('il salvataggio', () => {
    it('sta in basso, con la scritta "Salva": non c\'e\' piu\' la spunta senza testo in alto', async () => {
      const { q, root } = await monta();
      expect(q('ion-footer.salva-footer ion-button.salva-btn')!.textContent!.trim()).toBe('Salva');
      expect(root.querySelector('ion-header ion-buttons[slot="end"]')).toBeNull();
      expect(root.querySelector('ion-header ion-button.navicon')).toBeNull();
    });

    it('e\' spento finche\' non c\'e\' niente da salvare, e si accende scrivendo', async () => {
      const { q, scrivi } = await monta();
      const btn = () => q('ion-button.salva-btn') as any;
      expect(btn().disabled).toBe(true);

      scrivi('82');
      expect(btn().disabled).toBe(false);

      scrivi('');
      expect(btn().disabled).toBe(true);
    });

    it('mentre salva dice "Salvo…" e non si puo\' toccare di nuovo', async () => {
      const { q, scrivi, fixture, stato } = await monta();
      scrivi('82');
      stato.saving.set(true);
      fixture.detectChanges();
      expect(q('ion-button.salva-btn')!.textContent!.trim()).toBe('Salvo…');
      expect((q('ion-button.salva-btn') as any).disabled).toBe(true);
    });

    it('toccarlo salva la misura di oggi', async () => {
      const { q, scrivi, data } = await monta();
      scrivi('82');
      q('ion-button.salva-btn')!.click();
      await vi.waitFor(() => expect(data.saveCategoryToday).toHaveBeenCalledWith('peso', expect.objectContaining({ peso: '82' })));
    });

    it('in modifica dice "Salva modifiche"', async () => {
      const { q } = await monta({ modifica: true });
      expect(q('ion-button.salva-btn')!.textContent!.trim()).toBe('Salva modifiche');
    });
  });

  describe('di che giorno e\'', () => {
    it('una misura nuova dice che e\' di oggi, per esteso', async () => {
      const { q } = await monta();
      expect(q('.measure-when')!.textContent!.trim()).toBe(`Oggi, ${dataEstesa(todayLocalISO())}`);
    });

    it('e non ripete il nome della misura: il titolo della pagina lo dice gia\'', async () => {
      const { root } = await monta();
      expect(root.querySelector('.sectiontitle')).toBeNull();
    });

    it('in modifica c\'e\' invece il campo data, e non la riga "oggi"', async () => {
      const { q, root } = await monta({ modifica: true });
      expect(q('.measure-when')).toBeNull();
      expect(root.querySelector('input[type="date"]')).not.toBeNull();
    });
  });

  describe('l\'ultima volta', () => {
    it('sta sotto il campo, con unita\' e giorno, e il segnaposto non finge un valore', async () => {
      const { q, root } = await monta({ ultimi: { peso: { value: '82', date: giorniFa(1) } } });
      expect(q('.measure-last')!.textContent!.trim()).toBe('Ultimo 82 kg · ieri');
      const campo = root.querySelector('ion-input')!;
      expect(campo.getAttribute('placeholder')).toBe('—');
    });

    it('senza storico non c\'e\' la riga', async () => {
      const { q } = await monta();
      expect(q('.measure-last')).toBeNull();
    });

    it('in modifica non c\'e\': il valore e\' di una data passata, "ultimo" direbbe altro', async () => {
      const { q } = await monta({ modifica: true, ultimi: { peso: { value: '82', date: giorniFa(1) } } });
      expect(q('.measure-last')).toBeNull();
    });

    it('passando da una misura nuova a una in modifica (stessa pagina) non resta quella di prima', async () => {
      const { q, c, route, fixture } = await monta({ ultimi: { peso: { value: '82', date: giorniFa(1) } } });
      expect(q('.measure-last')).not.toBeNull();

      route.snapshot.queryParamMap = convertToParamMap({ date: '2026-05-01' });
      await c.load();
      fixture.detectChanges();

      expect(q('.measure-last')).toBeNull();
    });
  });

  describe('la forma dei campi', () => {
    it('un campo solo (il peso) prende tutta la larghezza', async () => {
      const { q } = await monta();
      expect(q('.measure-grid')!.classList.contains('cols-2')).toBe(false);
    });

    it('piu\' campi stanno su due colonne', async () => {
      const { q } = await monta({ categoria: 'centimetri' });
      expect(q('.measure-grid')!.classList.contains('cols-2')).toBe(true);
    });
  });

  describe('il messaggio dopo aver salvato', () => {
    it('il peso dice di quanto e\' cambiato dall\'ultima volta', async () => {
      const { c, toast } = await monta({ ultimi: { peso: { value: '82', date: giorniFa(3) } } });
      c.values['peso'] = '82,4';
      await c.save();
      expect(toast.success).toHaveBeenCalledWith('Peso salvato: 82,4 kg, +0,4 dall\'ultima volta');
    });

    it('in calo ha il meno', async () => {
      const { c, toast } = await monta({ ultimi: { peso: { value: '82', date: giorniFa(3) } } });
      c.values['peso'] = '81,5';
      await c.save();
      expect(toast.success).toHaveBeenCalledWith('Peso salvato: 81,5 kg, -0,5 dall\'ultima volta');
    });

    it('uguale lo dice a parole', async () => {
      const { c, toast } = await monta({ ultimi: { peso: { value: '82', date: giorniFa(3) } } });
      c.values['peso'] = '82';
      await c.save();
      expect(toast.success).toHaveBeenCalledWith('Peso salvato: 82 kg, come l\'ultima volta');
    });

    it('la prima pesata non ha un confronto da inventare', async () => {
      const { c, toast } = await monta();
      c.values['peso'] = '82';
      await c.save();
      expect(toast.success).toHaveBeenCalledWith('Peso salvato: 82 kg');
    });

    it('le altre misure dicono soltanto che sono salvate', async () => {
      const { c, toast } = await monta({ categoria: 'centimetri', ultimi: { cmVita: { value: '90', date: giorniFa(3) } } });
      c.values['cmVita'] = '89';
      await c.save();
      expect(toast.success).toHaveBeenCalledWith('Misurazione salvata');
    });

    it('se il salvataggio fallisce non si dice niente di bello', async () => {
      const { c, toast } = await monta({ salva: false });
      c.values['peso'] = '82';
      await c.save();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
