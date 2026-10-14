import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MeasureCategoryStateService {
  saving = signal(false);
  private saveHandler: (() => void) | null = null;

  registerSaveHandler(handler: (() => void) | null): void {
    this.saveHandler = handler;
  }

  requestSave(): void {
    this.saveHandler?.();
  }
}
