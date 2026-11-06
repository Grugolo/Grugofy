# Grugofy

Player musicale mobile-first per browser, senza backend. Riproduce file locali (audio/video) e video YouTube direttamente dal browser.

## Funzionalità

- **Libreria locale** — carica cartelle di file audio/video; cover estratta da ID3 tag o frame video
- **YouTube** — ricerca e riproduzione integrata tramite YouTube IFrame API
- **Coda** — aggiungi brani con swipe (sinistra = in fondo, destra = in cima); riordino drag & drop
- **Playlist** — salva coda o cronologia come playlist locale (localStorage); importa/esporta come .txt/.zip
- **Player espanso** — visualizza cover/video; swipe verticale chiude, orizzontale cambia brano; long-press 2× velocità; doppio tap seek ±5/10s
- **MediaSession** — controlli sistema (notifica Android/iOS): play/pausa, precedente, successivo, scrub (`seekto`). Silent anchor generato a runtime (WAV 10 s a livello bassissimo), mantenuto acceso anche in pausa per 30 min così la notifica non sparisce
- **Shuffle / Loop** — shuffle con ordine precalcolato; loop singolo brano
- **Persistenza sessione** — stato (coda, brano corrente, posizione) salvato in localStorage al cambio traccia, ogni ~5 s durante la riproduzione YT, in pausa e quando la pagina va in background; al reload il brano YT riprende in cue dal minuto salvato

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
│   │   ├── settings.js    # Preferenze utente persistenti (localStorage)
│   │   └── persist.js     # Salvataggio/ripristino sessione
│   ├── modules/
│   │   ├── localFiles.js  # Caricamento cartella, cover, durata, ingest condiviso (input + drag&drop)
│   │   ├── youtube.js     # Ricerca YT e render risultati
│   │   ├── ytApi.js       # Helper condiviso: fetch YT con fallback multi-chiave + fetchDurations (videos.list, cache)
│   │   └── lyrics.js      # Lyrics sincronizzati (lrclib.net), overlay su player YT
│   └── ui/
│       ├── controls.js       # Player bar, icone SVG, updateUI
│       ├── expandedPlayer.js # Player espanso, gesture, resize YT
│       ├── queueUI.js        # Render coda e playlist salvate
│       ├── importModal.js    # Modale "+": file locali, link YouTube, CSV o titoli (una riga per elemento)
│       └── settingsModal.js  # Modale "⚙": impostazioni
```



### Limiti noti
- Righe CSV che puntano a file locali (`Titolo, NomeFile.mp3`) sono gestite solo nell'import di file `.txt` dalla libreria, non nella textarea (lì la libreria potrebbe non essere caricata).
- Dopo un reload della pagina il video YT riparte in pausa dal minuto salvato (l'autoplay senza gesto è bloccato dal browser).
- I brani locali in coda non vengono ripristinati dopo un reload (i `File` non sono persistibili).
- Il toggle "provider" oggi controlla solo la ricerca YouTube; riproduzione e import da link restano attivi.
