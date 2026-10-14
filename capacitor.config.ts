import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Le app native (iOS e Android) impacchettano lo stesso build della PWA.
 * appId va cambiato con l'identificativo definitivo PRIMA del primo
 * `npx cap add`: dopo, e' scritto nei progetti nativi e cambiarlo li' e'
 * un lavoro a mano.
 */
const config: CapacitorConfig = {
  appId: 'it.workoutlab.app',
  appName: 'Workout Lab',
  webDir: 'dist/workoutlab/browser',
  plugins: {
    Keyboard: { resize: 'body' },
    StatusBar: { overlaysWebView: true }
  }
};

export default config;
