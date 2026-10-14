import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProtocolBuilderStateService {
  editingSubform = signal(false);
  saving = signal(false);
  private draftHandler: (() => void) | null = null;
  private activateHandler: (() => void) | null = null;

  registerHandlers(draft: (() => void) | null, activate: (() => void) | null): void {
    this.draftHandler = draft;
    this.activateHandler = activate;
  }

  requestSaveDraft(): void {
    this.draftHandler?.();
  }

  requestSaveActivate(): void {
    this.activateHandler?.();
  }
}
