/**
 * La funzione dei promemoria provata davvero: Firestore in emulazione, due
 * "telefoni" su un server locale, e il messaggio decifrato come lo decifra il
 * browser (RFC 8291, aes128gcm). Controlla che si manda solo a chi tocca, che
 * il telefono che non c'e' piu' si toglie e che il prossimo si fissa.
 *
 *   npm --prefix functions run test:integrazione   (serve Java 21, come test:rules)
 */
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

let ko = 0;
const prova = (nome, ok, dettaglio = '') => {
  if (ok) console.log('  ok   ', nome);
  else { ko++; console.log('  KO   ', nome, dettaglio); }
};

// ---- I telefoni: un server che riceve le push ----
// web-push parla solo HTTPS: il server locale ha un certificato fatto qui, e
// solo in questo processo i certificati non si controllano.
const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'promemoria-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
  '-subj', '/CN=127.0.0.1', '-keyout', path.join(cartella, 'k.pem'), '-out', path.join(cartella, 'c.pem')], { stdio: 'ignore' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ricevute = [];
const server = https.createServer({ key: fs.readFileSync(path.join(cartella, 'k.pem')), cert: fs.readFileSync(path.join(cartella, 'c.pem')) }, (req, res) => {
  const pezzi = [];
  req.on('data', c => pezzi.push(c));
  req.on('end', () => {
    ricevute.push({ url: req.url, headers: req.headers, corpo: Buffer.concat(pezzi) });
    res.writeHead(req.url === '/morto' ? 410 : 201).end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `https://127.0.0.1:${server.address().port}`;

/** Un telefono: le sue chiavi, come le crea il browser. */
function telefono(percorso) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    ecdh, auth,
    iscrizione: { endpoint: base + percorso, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } }
  };
}

/** Il messaggio decifrato come fa il browser (RFC 8291 + RFC 8188). */
function decifra(t, corpo) {
  const sale = corpo.subarray(0, 16);
  const idlen = corpo[20];
  const chiaveServer = corpo.subarray(21, 21 + idlen);
  const cifrato = corpo.subarray(21 + idlen);
  const condiviso = t.ecdh.computeSecret(chiaveServer);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), t.ecdh.getPublicKey(), chiaveServer]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', condiviso, t.auth, info, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sale, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sale, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cifrato.subarray(cifrato.length - 16));
  const chiaro = Buffer.concat([d.update(cifrato.subarray(0, cifrato.length - 16)), d.final()]);
  // Il riempimento finisce col delimitatore 0x02 dell'ultimo blocco.
  return JSON.parse(chiaro.subarray(0, chiaro.lastIndexOf(2)).toString('utf8'));
}

// ---- Le chiavi del server, e la funzione ----
const chiavi = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = chiavi.publicKey;
process.env.VAPID_PRIVATE_KEY = chiavi.privateKey;
process.env.VAPID_SUBJECT = 'https://workout-lab.example';
process.env.GCLOUD_PROJECT ??= 'demo-promemoria';

const { promemoria } = require('../lib/index.js');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const db = getFirestore();

const adesso = new Date();
const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(adesso.getTime() + 30 * 60_000));
const oggiRoma = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(adesso);
const unMinutoFa = Timestamp.fromDate(new Date(adesso.getTime() - 60_000));
const tutti = [1, 2, 3, 4, 5, 6, 7];
const programma = [{ id: 'd1', label: 'Petto e tricipiti' }, { id: 'd2', label: 'Schiena' }];

const vivo = telefono('/vivo');
const morto = telefono('/morto');
const altro = telefono('/altro');
const doc = uid => db.doc(`users/${uid}/promemoria/impostazioni`);

await doc('u1').set({ attivo: true, giorni: tutti, ora, fuso: 'Europe/Rome', prossimo: unMinutoFa, programma, iscrizioni: { tvivo: vivo.iscrizione, tmorto: morto.iscrizione } });
await doc('u2').set({ attivo: true, giorni: tutti, ora, fuso: 'Europe/Rome', prossimo: unMinutoFa, programma, ultimaSeduta: oggiRoma, iscrizioni: { taltro: altro.iscrizione } });
await doc('u3').set({ attivo: false, giorni: tutti, ora, fuso: 'Europe/Rome', prossimo: unMinutoFa, iscrizioni: { taltro: altro.iscrizione } });
await doc('u4').set({ attivo: true, giorni: tutti, ora, fuso: 'Europa/Roma', prossimo: unMinutoFa, iscrizioni: { taltro: altro.iscrizione } });
await doc('u5').set({ attivo: true, giorni: tutti, ora, fuso: 'Europe/Rome', prossimo: Timestamp.fromDate(new Date(adesso.getTime() + 3600_000)), iscrizioni: { taltro: altro.iscrizione } });

await promemoria.run({ scheduleTime: adesso.toISOString() });

console.log('\n— chi riceve —');
prova('il telefono vivo riceve una push', ricevute.filter(r => r.url === '/vivo').length === 1);
prova('si prova anche quello che non c\'e\' piu\'', ricevute.filter(r => r.url === '/morto').length === 1);
prova('nessuna push a chi si e\' allenato oggi, ha i promemoria spenti, un fuso sbagliato o non e\' ancora all\'ora',
  ricevute.filter(r => r.url === '/altro').length === 0, JSON.stringify(ricevute.map(r => r.url)));

console.log('\n— il messaggio —');
const arrivo = ricevute.find(r => r.url === '/vivo');
prova('cifrato come vuole il browser (aes128gcm)', arrivo?.headers['content-encoding'] === 'aes128gcm');
prova('firmato con la chiave VAPID del server', String(arrivo?.headers['authorization']).startsWith('vapid t=') && String(arrivo?.headers['authorization']).includes(`k=${chiavi.publicKey}`));
prova('scade in venti minuti, urgente, sostituisce il precedente', arrivo?.headers['ttl'] === '1200' && arrivo?.headers['urgency'] === 'high' && arrivo?.headers['topic'] === 'promemoria',
  JSON.stringify({ ttl: arrivo?.headers['ttl'], urgency: arrivo?.headers['urgency'], topic: arrivo?.headers['topic'] }));
let messaggio = null;
try { messaggio = decifra(vivo, arrivo.corpo); } catch (e) { prova('si decifra', false, String(e)); }
prova('decifrato, e\' la notifica per il service worker di Angular', messaggio?.notification?.title === `Oggi alle ${ora}: Petto e tricipiti`, JSON.stringify(messaggio));
prova('il tocco apre la seduta che tocca', messaggio?.notification?.data?.onActionClick?.default?.url === '/scheda/day/0');

console.log('\n— cosa resta scritto —');
const u1 = (await doc('u1').get()).data();
prova('il telefono che non c\'e\' piu\' si toglie, l\'altro resta', Object.keys(u1.iscrizioni).join() === 'tvivo', JSON.stringify(Object.keys(u1.iscrizioni)));
prova('il prossimo e\' fra circa un giorno', u1.prossimo.toMillis() > adesso.getTime() + 20 * 3600_000 && u1.prossimo.toMillis() < adesso.getTime() + 25 * 3600_000);
prova('l\'esito si legge', u1.ultimoEsito === 'mandato a 1 su 2', u1.ultimoEsito);
const u2 = (await doc('u2').get()).data();
prova('chi si e\' allenato oggi: niente, ma il prossimo si fissa', u2.ultimoEsito === 'gia\' fatta oggi' && u2.prossimo.toMillis() > adesso.getTime(), u2.ultimoEsito);
const u3 = (await doc('u3').get()).data();
prova('i promemoria spenti non si toccano', u3.ultimoGiro === undefined);
const u4 = (await doc('u4').get()).data();
prova('un fuso sbagliato: niente prossimo, e lo dice', u4.prossimo === null && u4.ultimoEsito === 'dati non validi', JSON.stringify(u4.ultimoEsito));
const u5 = (await doc('u5').get()).data();
prova('chi non e\' ancora all\'ora non si tocca', u5.ultimoGiro === undefined);

server.close();
console.log(ko ? `\n${ko} PROVE NON PASSATE` : '\nTUTTO COME DEVE ESSERE');
process.exit(ko ? 1 : 0);
