# fullforce-private-ai-agent
Inhouse AI chatbot omgeving voor CS Rental, schaalbaar voor meerdere klanten.

## Vereisten
- Node.js \>=18

## Installatie en opstart
1. Installeer dependencies:
   ```bash
   npm install
   ```
2. Start de ontwikkelomgeving:
   ```bash
   npm run dev
   ```
   De server draait standaard op `http://localhost:3000`.

## Omgevingsvariabelen
Voeg de vereiste variabelen toe aan je `.env.local` bestand. Bekijk `.env.local.example` voor alle opties.

## Belangrijke scripts

### Security
- `npm run security:audit` – controleer dependencies op kwetsbaarheden.
- `npm run security:fix` – los gedetecteerde problemen automatisch op.
- `npm run security:scan` – voer de custom securityscan uit.
- `npm run security:report` – genereer een auditrapport.
- `npm run test:security` – draait aanvullende securitytests.
- `npm run deps:audit` – extra dependency-audit.

### RAG
- `npm run rag:ingest` – importeer documenten naar de RAG‑pipeline.
- `npm run rag:process` – verwerk een individueel document.
- `npm run rag:process-all` – verwerk alle openstaande documenten.
- `npm run rag:status` – toon de verwerkingsstatus.
- `npm run rag:mark-for-indexing` – markeer documenten voor indexering.
- `npm run rag:monitor` – monitor de RAG‑status.
- `npm run rag:create-test-docs` – maak testdocumenten aan.
- `npm run rag:test` – opent de RAG‑testpagina.
- `npm run rag:verify` – voer de schema/health check uit (`scripts/verify-rag-health.js`).

De volledige ingest‑pipeline gebruikt de variabelen `SUPABASE_DOCUMENTS_BUCKET`, `RAG_EMBEDDING_MODEL`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_BATCH_SIZE`, `RAG_CONCURRENCY` en `RAG_DELAY_MS`. Alle scripts zijn idempotent: je kunt veilig `npm run rag:mark-for-indexing` en `npm run rag:process-all` herhaaldelijk draaien. Reeds verwerkte documenten worden overgeslagen, terwijl bestanden die een OCR‑herkansing nodig hebben als `needs_ocr` gemarkeerd blijven staan.

#### End-to-end RAG workflow
1. **Migraties draaien** – `npm run db:setup` zorgt dat het Supabase schema up-to-date is.
2. **Health check** – `npm run rag:verify` controleert verplichte kolommen, orphan chunks en de `match_documents` RPC.
3. **Documenten uploaden** – gebruik `npm run upload:all-docs -- <pad>` of één van de bulk‑upload scripts. De metadata tabel krijgt automatisch de juiste `storage_path` en `ready_for_indexing`-vlaggen.
4. **Indexeren voorbereiden** – markeer nieuwe of gewijzigde bestanden met `npm run rag:mark-for-indexing`.
5. **Verwerken** – `npm run rag:process-all` downloadt bestanden, extraheert tekst (inclusief OCR), genereert embeddings en schrijft chunks naar `document_chunks`.
   - Bestanden zoals `Thumbs.db`, `.DS_Store` of extreem kleine afbeeldingen worden als “skipped” geregistreerd zonder fouten.
   - OCR-fouten markeren het document als `needs_ocr` met een duidelijke `last_error`, zonder dat het batchproces stopt.
   - Contentproblemen (bijv. lege bestanden of onbekende mime-types) worden als verwerkt gemarkeerd met `chunk_count = 0`, zodat het proces niet blijft hangen.
6. **Health check herhalen** – `npm run rag:verify` toont dat er geen orphan chunks zijn, dat alle kolommen beschikbaar zijn en dat de `match_documents` RPC resultaten levert.

### Bulk upload
- `npm run bulk-upload` – bulkupload van documenten.
- `npm run bulk-upload:handleidingen` – upload handleidingen in bulk.
- `npm run bulk-upload:monitor` – monitor de uploadvoortgang.
- `npm run bulk-upload:verify` – controleer of uploads correct zijn verwerkt.
- `npm run mirror-folders` – spiegel lokale mappen naar Supabase.
- `npm run upload-from-drive` – upload bestanden vanaf een lokale schijf.
- `npm run upload:all-docs -- <pad>` – upload alle documenten uit een lokale map naar Supabase Storage.

### Automatisch uploaden
Je kunt deze script handmatig draaien of automatiseren met een cron-job om nieuwe bestanden te uploaden. Voorbeeld (elk uur):

```bash
0 * * * * cd /pad/naar/project && npm run upload:all-docs -- /pad/naar/documenten >> upload.log 2>&1
```

## Supabase
Supabase levert de Postgres‑database, authenticatie en opslag. De SQL‑migraties staan in `supabase/migrations`.

### Inloggen testen
- Start de Next.js app (`npm run dev`) en navigeer naar [`/login`](http://localhost:3000/login).
- Gebruik het Supabase-account `diego.a.scognamiglio@gmail.com` met wachtwoord `Hamkaastostimetkaka321@!` om in te loggen.
- De repository bevat een fallback Supabase-configuratie zodat deze inlog werkt zonder aanvullende `.env` variabelen. Voor productie is het wel aan te raden eigen `NEXT_PUBLIC_SUPABASE_URL` en `NEXT_PUBLIC_SUPABASE_ANON_KEY` te configureren.

### Migratiestappen
1. Voer Supabase‑migraties uit met:
   ```bash
   npm run db:setup
   ```
2. Controleer de database:
   ```bash
   npm run db:verify
   ```
3. Valideer schema‑compliance:
   ```bash
   npm run schema:verify
   ```

### Handmatige bootstrap
Voer na het clonen éénmalig het script [`sql/bootstrap.sql`](./sql/bootstrap.sql) uit via de Supabase SQL Editor:

1. Open het Supabase dashboard van je project.
2. Ga naar **SQL** \> **SQL Editor**.
3. Plak de inhoud van `sql/bootstrap.sql` en klik op **Run**.

Het script is idempotent en kan veilig opnieuw gedraaid worden.

## Testen
- `npm test` – draait de Jest‑test suite.
- `npm run test:security` – voert beveiligingstests uit.

## Deployment
1. Voer migraties uit (`npm run db:setup`) en controleer (`npm run db:verify`).
2. Bouw de applicatie:
   ```bash
   npm run build
   ```
3. Start de productie‑server:
   ```bash
   npm start
   ```
4. Zorg dat vereiste omgevingsvariabelen aanwezig zijn.

## Omgevingsvariabelen

Voor het cron-endpoint moeten de volgende variabelen ingesteld zijn:

- `CRON_API_KEY`
- `CRON_BYPASS_KEY`

Als een van deze ontbreekt, wordt er een fout gelogd en stopt de server of geeft het endpoint een 500-fout terug.

## IP-configuratie

De middleware controleert inkomende requests op een IP-whitelist. Deze lijst staat in `config/ip.json` en kan worden aangepast zonder codewijzigingen. Het bestand bevat een array met toegestane IP-adressen:

```json
[
  "127.0.0.1",
  "::1"
]
```

Als het configuratiebestand ontbreekt of niet geldig is, wordt er bij het opstarten een waarschuwing gelogd.

## Feedbackanalyse

Het AI‑feedbacksysteem houdt permanent bij hoeveel positieve en negatieve beoordelingen zijn gegeven.
Deze teller is **cumulatief** en wordt nooit gereset; elke nieuwe feedback telt op bij het totaal.
