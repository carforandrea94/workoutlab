import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import webpush, { WebPushError } from 'web-push';
import { DatiPromemoria, EsitoInvio, Iscrizione, gestisci } from './giro';

/**
 * I promemoria degli allenamenti.
 *
 * Ogni cinque minuti si cercano i promemoria arrivati all'ora (il campo
 * `prossimo` di users/{uid}/promemoria/impostazioni, che l'app scrive quando
 * si sceglie l'orario e la funzione riscrive dopo ogni giro) e li si manda con
 * Web Push al service worker dell'app. Le chiavi VAPID firmano i messaggi: la
 * pubblica e' anche nell'app (environment.ts), la privata e' un segreto di
 * Firebase. I passi per attivarla sono in docs/promemoria.md.
 */

initializeApp();

const VAPID_PRIVATA = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBBLICA = defineString('VAPID_PUBLIC_KEY');
/** Un recapito per i servizi di push: e' obbligatorio, e un indirizzo del sito basta. */
const VAPID_RECAPITO = defineString('VAPID_SUBJECT', { default: 'https://workout-lab-8c567.web.app' });

/** Il messaggio scade dopo venti minuti: se il telefono e' spento, a mezz'ora dall'allenamento non serve piu'. */
const DURATA_SECONDI = 20 * 60;

export const promemoria = onSchedule(
  { schedule: 'every 5 minutes', region: 'europe-west1', secrets: [VAPID_PRIVATA], timeoutSeconds: 120, maxInstances: 1 },
  async () => {
    webpush.setVapidDetails(VAPID_RECAPITO.value(), VAPID_PUBBLICA.value(), VAPID_PRIVATA.value());
    const adesso = new Date();
    const arrivati = await getFirestore().collectionGroup('promemoria')
      .where('attivo', '==', true)
      .where('prossimo', '<=', Timestamp.fromDate(adesso))
      .limit(500)
      .get();

    const invia = async (s: Iscrizione, testo: string): Promise<EsitoInvio> => {
      try {
        await webpush.sendNotification(s as webpush.PushSubscription, testo, { TTL: DURATA_SECONDI, urgency: 'high', topic: 'promemoria' });
        return 'ok';
      } catch (e) {
        // 404 e 410: l'iscrizione non esiste piu'. Il resto (rete, servizio giu') si riprova al prossimo giro.
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return 'scaduta';
        logger.warn('Invio di un promemoria fallito', { errore: String(e) });
        return 'errore';
      }
    };

    // Un documento rotto non deve fermare quelli degli altri.
    await Promise.all(arrivati.docs.map(async doc => {
      try {
        const raw = doc.data();
        const dati: DatiPromemoria = { ...raw, prossimo: raw['prossimo'] instanceof Timestamp ? raw['prossimo'].toDate() : null };
        const r = await gestisci(dati, adesso, invia);
        await doc.ref.update({
          prossimo: r.prossimo ? Timestamp.fromDate(r.prossimo) : null,
          ultimoGiro: Timestamp.fromDate(adesso),
          ultimoEsito: r.esito,
          // Si toglie solo la chiave di quel telefono: uno iscritto intanto non si perde.
          ...Object.fromEntries(r.scadute.map(chiave => [`iscrizioni.${chiave}`, FieldValue.delete()]))
        });
      } catch (e) {
        logger.error('Promemoria non gestito', { documento: doc.ref.path, errore: String(e) });
      }
    }));
    logger.info('Giro dei promemoria', { arrivati: arrivati.size });
  }
);
