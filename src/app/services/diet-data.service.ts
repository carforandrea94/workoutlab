import { Injectable } from '@angular/core';
import { Diet } from '../models/diet.model';

@Injectable({ providedIn: 'root' })
export class DietDataService {

  diet: Diet = [];

  applyDiet(diet: Diet): void {
    this.diet = diet;
  }

  getPlan(id: string) {
    return this.diet.find(p => p.id === id) ?? null;
  }
}
