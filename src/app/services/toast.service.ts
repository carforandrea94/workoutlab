import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface ToastState {
  kind: ToastKind;
  message: string;
}

const TOAST_DURATION_MS = 2500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  toast = signal<ToastState | null>(null);
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  success(message: string): void {
    this.show('success', message);
  }

  error(message: string): void {
    this.show('error', message);
  }

  private show(kind: ToastKind, message: string): void {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.toast.set({ kind, message });
    this.hideTimeout = setTimeout(() => this.toast.set(null), TOAST_DURATION_MS);
  }
}
