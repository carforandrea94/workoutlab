import { Capacitor } from '@capacitor/core';

/**
 * Dentro l'app nativa (Capacitor) la pagina gira in una WebView: Google
 * rifiuta l'accesso dentro le WebView incorporate e i popup di Firebase non
 * ci funzionano. Li' l'accesso con Google richiederebbe un plugin nativo.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Rileva Safari su iOS/iPadOS aperto come normale scheda browser, non come
 * app installata sulla schermata Home. Su iOS le notifiche (Notification API)
 * funzionano solo in modalita' standalone: da scheda Safari il permesso non
 * viene mai concesso davvero, quindi va evitato di richiederlo a vuoto.
 */
export function isIosSafariNotStandalone(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS si presenta come Mac
  if (!isIos) return false;

  const isStandalone = (navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return !isStandalone;
}
