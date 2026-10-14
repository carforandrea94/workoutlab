import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// ReadableStream asincrono iterabile (`for await...of`) e' una Web API
// arrivata su Safari dopo il supporto base a ReadableStream: su versioni
// di Safari/iOS meno recenti manca ancora, e pdfjs-dist la usa internamente
// in Page.getTextContent() ("for await (const value of readableStream)").
// Il build "legacy" di pdfjs-dist include polyfill core-js per feature del
// linguaggio JS, ma non per questa Web API - da qui un crash a runtime
// ("undefined is not a function") solo su quei dispositivi, non riproducibile
// altrove. Polyfill minimo, standard, applicato solo se davvero mancante.
if (typeof ReadableStream !== 'undefined' && !(ReadableStream.prototype as any)[Symbol.asyncIterator]) {
  (ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
