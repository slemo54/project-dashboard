# A × N

Spazio collaborativo minimale per AIdeale, Bookingolf e Slutti Spaghetti.

## Stack
Next.js su Vercel; Postgres, Storage privato e API Edge su Supabase. Nessun account ChatGPT richiesto. L'accesso usa credenziali condivise e cookie HttpOnly con scadenza di sette giorni.

## Sviluppo
Node.js 22 o successivo. Eseguire `npm ci`, copiare `.env.example` in `.env.local`, configurare URL e chiave pubblicabile Supabase, quindi `npm run dev`.

`npm run build` verifica compilazione e tipi. Le dipendenze sono fissate nel lockfile.

## Backend
Le migrazioni sono in `supabase/migrations`. Il codice dell'API è in `supabase/functions/axn-api`; usa le chiavi amministrative fornite dall'ambiente Supabase, mai dal browser o dal repository. La verifica JWT del gateway è disabilitata perché ogni route privata verifica la sessione HMAC dell'app. Le tabelle hanno RLS e nessun permesso per anon o authenticated; il bucket dei deliverable è privato. Il proxy Next.js controlla l'origine delle richieste che modificano dati.

Configurazione delle credenziali nella tabella protetta `axn_settings`: username, salt, hash PBKDF2 SHA-256 (tre passaggi da 80.000 iterazioni), segreto casuale per le sessioni. Le credenziali reali non fanno parte del repository. L'endpoint di login limita i tentativi a 30 al minuto.

## Workflow
Kanban: Backlog → Da fare → In corso → In revisione → Completato. Task con brief, output atteso, responsabile, priorità e scadenza; commenti, consegne e anteprime. Il workspace aggiorna i dati ogni 30 secondi quando la pagina è visibile. Su telefono le colonne scorrono orizzontalmente; lo stato si modifica anche dal dettaglio della task.

Upload diretto su Storage mediante URL firmato, verifica del file prima di pubblicare la consegna, download firmati di dieci minuti. Formati ammessi: ai, psd, fig, xd, indd, eps, svg, png, jpg, jpeg, webp, gif, pdf, doc, docx, ppt, pptx, mp4, mov, webm, zip. Limite applicativo 50 MB; resta applicabile l'eventuale limite inferiore del piano Storage. Per sorgenti più grandi usare un link nel campo output atteso.

## Deploy
Collegare il repository a Vercel e impostare `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` per Production e Preview. Non esporre alcuna chiave segreta sul frontend.
