# Grugofy

Player musicale mobile-first per browser, senza backend. Riproduce file locali (audio/video) e video YouTube direttamente dal browser.

## Funzionalità

- **Libreria locale** — carica cartelle di file audio/video; cover estratta da ID3 tag o frame video
- **YouTube** — ricerca e riproduzione integrata tramite YouTube IFrame API
- **Coda** — aggiungi brani con swipe (sinistra = in fondo, destra = in cima); riordino drag & drop
- **Playlist** — salva coda o cronologia come playlist locale (localStorage); importa/esporta come .txt/.zip
- **Player espanso** — visualizza cover/video; swipe verticale chiude, orizzontale cambia brano; long-press 2× velocità; doppio tap seek ±5/10s
- **MediaSession** — controlli sistema (notifica Android/iOS); compatibile Brave mobile tramite silent anchor WAV
- **Shuffle / Loop** — shuffle con ordine precalcolato; loop singolo brano
- **Persistenza sessione** — stato (coda, brano corrente, posizione) salvato in localStorage al cambio traccia

## Struttura

```
Grugofy-main/
├── index.html
├── style.css
├── service-worker.js
├── manifest.json
├── js/
│   ├── config.js          # API key YouTube (array, con fallback automatico)
│   ├── main.js            # Entry point + wiring tra moduli core
│   ├── utils.js           # Funzioni pure (formatTime, escHtml, fmtDateShort, …)
│   ├── core/
│   │   ├── store.js       # Stato globale + setState() per patch tracciabili
│   │   ├── events.js      # Event bus (EventTarget)
│   │   ├── player.js      # Motore riproduzione locale + YT
│   │   ├── queue.js       # Logica coda e playlist (nessun import diretto di player.js)
│   │   └── persist.js     # Salvataggio/ripristino sessione
│   ├── modules/
│   │   ├── localFiles.js  # Caricamento cartella, cover, durata, ingest condiviso (input + drag&drop)
│   │   ├── youtube.js     # Ricerca YT e render risultati
│   │   ├── ytApi.js       # Helper condiviso: fetch YT con fallback multi-chiave
│   │   └── lyrics.js      # Lyrics sincronizzati (lrclib.net), overlay su player YT
│   └── ui/
│       ├── controls.js       # Player bar, icone SVG, updateUI
│       ├── expandedPlayer.js # Player espanso, gesture, resize YT
│       ├── queueUI.js        # Render coda e playlist salvate
│       └── importModal.js    # Modale "+": file locali o link/lista YouTube
```

### Wiring tra moduli (novità)

`player.js` e `queue.js` avevano una dipendenza circolare risolta prima con
`import()` dinamici sparsi nel codice. Ora nessuno dei due importa
direttamente l'altro: `main.js` li collega esplicitamente all'avvio con
`wireQueue()` e `wirePlayback()`. Stesso principio per `queue.js` → UI
(`wireQueueUI()`), al posto di `import('../ui/queueUI.js')` inline.

Vantaggio: leggendo `main.js` si vede subito chi dipende da chi, senza dover
grep-are import dinamici sparsi nei vari file.

## Avvio

Nessun build step. Apri `index.html` con un server locale (es. `npx serve .` oppure Live Server in VS Code). Non funziona da `file://` per via dei moduli ES e della File System Access API.

## Config

In `js/config.js` sostituisci le stringhe in `YT_API_KEY` con le tue chiavi da [Google Cloud Console](https://console.cloud.google.com/) (API YouTube Data v3). Puoi mettere una sola chiave o un array: se una finisce la quota, l'app prova automaticamente la successiva.

## Formato file playlist (.txt)

```
Nome brano, ID_o_percorso, durata_secondi
```
Esempio:
```
Bohemian Rhapsody, dQw4w9WgXcQ, 354
My Song, NomeFile.mp3, 210
```
Se una riga contiene solo il nome (senza virgole), viene cercata su YouTube e viene caricato il primo risultato.

## Compatibilità

Testato su Chrome/Brave mobile (Android). Richiede browser con supporto ES Modules, File API, MediaSession API.

## Changelog fix (refactor)
- **Bug**: `fmtDateShort()` in `utils.js` usava variabili mai definite (`m`, `g` invece di `mm`, `gg`) → `ReferenceError` ogni volta che si mostrava la data di pubblicazione di un video YouTube. Corretto.
- **Bug**: l'import di una playlist `.txt` con righe di solo testo cercava su YouTube passando `YT_API_KEY` (un array) direttamente in query string invece di provare le chiavi una a una → ricerca sempre fallita. Ora usa lo stesso helper `ytApi.js` con fallback multi-chiave usato dalla ricerca normale.
- **Bug**: `js/ui/library.js` era codice morto — cercava un elemento `#libraryList` mai esistito in `index.html` (l'id reale è `#library`), non veniva mai importato da `main.js`, e ascoltava un evento `libraryUpdate` mai emesso da nessuna parte. Rimosso: la libreria è gestita interamente da `localFiles.js`.
- **Bug**: `controls.js` registrava due listener sullo stesso evento `PLAYER_CHANGE` che chiamavano entrambi `updateUI()` con argomenti diversi in sequenza → doppio render e possibile race sull'ultimo stato applicato. Ridotto a un solo listener.
- **Pulizia**: JSZip era caricato sia come `<script>` globale (cdnjs) sia come import ESM da `esm.sh` in `queue.js`. Tenuta solo la versione globale da cdnjs; rimosso l'import ESM ridondante.
- **Refactor**: eliminate le dipendenze circolari mascherate da `import()` dinamici tra `player.js` ↔ `queue.js` e tra `queue.js` ↔ `ui/queueUI.js`. Sostituite con un wiring esplicito in `main.js` (`wireQueue`, `wirePlayback`, `wireQueueUI`).
- **Refactor**: estratto `js/modules/ytApi.js` con la logica di fetch-con-fallback-chiavi, prima duplicata identica sia in `youtube.js` che in `queue.js`.
- **Refactor**: `store.js` ora espone anche `setState(patch)` per mutazioni tracciabili via evento `STATE_CHANGE`, oltre alla scrittura diretta già usata internamente dai moduli core.

## Nuove funzionalità (round 2)

- **Drag & drop desktop** (`localFiles.js`): trascina file o intere cartelle sulla finestra del browser. Usa `DataTransferItem.webkitGetAsEntry()` per leggere l'albero delle cartelle trascinate, poi confluisce nella stessa pipeline `ingestFiles()` usata dall'`<input>` classico.
- **Modale "+" per import** (`ui/importModal.js`, markup in `index.html`): scegli tra file locali (audio/video/playlist .txt) o incolla un link YouTube (video singolo o playlist intera). L'input file storico resta funzionante, ora nascosto e attivato dal bottone nella modale.
- **Import playlist/video da link YouTube** (`fetchYouTubeItemsFromUrl` in `core/queue.js`): riconosce sia URL di singolo video sia URL con `?list=`. Le playlist vengono scaricate paginando `playlistItems.list` (50 elementi a chiamata, costo 1 unità/pagina) — nessun limite artificiale, l'intera playlist viene importata. I video privati o rimossi vengono scartati automaticamente. Le durate sono recuperate in blocchi da 50 id tramite `videos.list`.
- **Tracking quota YouTube** (`modules/ytApi.js`): ogni chiamata API logga in console il costo reale in "unità" (search=100, playlistItems/videos=1) e il totale giornaliero salvato in localStorage — solo diagnostico, non mostrato in UI.
- **Shuffle a 3 stadi** (`store.shuffleMode`: 0/1/2): 0 = spento (grigio), 1 = shuffle brani libreria/playlist YT (verde), 2 = shuffle libreria **+** coda (rosso). In stadio 2 `dequeueNext()` in `core/queue.js` pesca una posizione casuale della coda invece della prima — la coda non si riordina visivamente, ma i brani già estratti/riprodotti spariscono dalla lista come di consueto. L'ordine casuale viene rigenerato ogni volta che il pulsante viene premuto.
- **Toggle player con click su now-playing**: `togglePlayer()` ora è un vero toggle bidirezionale (prima apriva sempre, mai chiudeva). Bug corretto in `ui/expandedPlayer.js`.
- **Player YouTube ridimensionabile** (`ui/expandedPlayer.js` + CSS): handle di drag (mouse e touch, via Pointer Events) sotto il player YT nell'expanded view; l'altezza scelta (25–100% dell'altezza disponibile) è salvata in localStorage e ripristinata alle sessioni successive.
- **Lyrics sincronizzati** (`modules/lyrics.js`): interroga l'API pubblica e gratuita [lrclib.net](https://lrclib.net) (nessuna chiave richiesta) per testi in formato LRC sincronizzati al millisecondo. Overlay in basso sul player YouTube espanso, sopra la progress bar nativa di YouTube. Per i brani locali il nome file viene euristicamente separato in "Artista - Titolo"; per YouTube si usa `uploader` + `title` ripulito da tag tipo "(Official Video)". Se lrclib non trova un match esatto, tenta una ricerca libera come fallback; se non trova comunque nulla, la riga resta semplicemente nascosta (nessun testo placeholder).

### Note tecniche sulla quota YouTube

Le API YouTube Data v3 hanno un budget di **10.000 unità/giorno** per progetto (si resetta a mezzanotte Pacific Time). Costi reali:
- `search.list` (ricerca testuale) → **100 unità** — quindi ~100 ricerche testuali esauriscono l'intera quota
- `playlistItems.list` / `videos.list` → **1 unità per pagina** (fino a 50 elementi) — importare anche playlist molto grandi costa pochissimo

Per questo l'import da link YouTube (playlist o video) non applica alcun limite: al massimo costa qualche unità anche per centinaia di brani. La ricerca a testo libero (barra di ricerca, o playlist `.txt` con nomi anziché ID/URL) resta invece l'operazione più "costosa" e va usata con più parsimonia se si dispone di una sola chiave API.
