import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { providerPagina } from '../../../test-support/pagina';
import { vi } from 'vitest';
import { DietaDetailComponent } from './dieta-detail.component';
import { DietDataService } from '../../services/diet-data.service';
import { DietStateService } from '../../services/diet-state.service';
import { AppStateService } from '../../services/app-state.service';

describe('DietaDetailComponent — prova di disegno', () => {
  it('si disegna', async () => {
    const piano: any = {
      id: 'p1', name: 'Giorno ON',
      meals: [{
        id: 'm1', name: 'Colazione',
        combinations: [{ id: 'c1', label: 'Base', carb: { name: 'Avena', qty: '80 g', alt: [{ name: 'Riso', qty: '70 g' }] }, protein: null, fat: null }],
        alternatives: { carb: [], protein: [], fat: [] },
        supplements: []
      }]
    };
    TestBed.configureTestingModule({
      imports: [DietaDetailComponent],
      providers: [
        ...providerPagina(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ mode: 'p1' }) } } },
        { provide: DietDataService, useValue: { getPlan: () => piano } },
        { provide: DietStateService, useValue: { viewMode: signal('list'), setViewMode: vi.fn() } },
        { provide: AppStateService, useValue: { load: async () => ({ mealsCompletion: null }) } }
      ]
    });
    const fixture = TestBed.createComponent(DietaDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    console.log(fixture.nativeElement.innerHTML.slice(0, 1500));
    expect(fixture.nativeElement.querySelector('.meal-summary')).toBeTruthy();
  });
});
