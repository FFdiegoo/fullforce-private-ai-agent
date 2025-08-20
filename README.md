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

### Bulk upload
- `npm run bulk-upload` – bulkupload van documenten.
- `npm run bulk-upload:handleidingen` – upload handleidingen in bulk.
- `npm run bulk-upload:monitor` – monitor de uploadvoortgang.
- `npm run bulk-upload:verify` – controleer of uploads correct zijn verwerkt.
- `npm run mirror-folders` – spiegel lokale mappen naar Supabase.
- `npm run upload-from-drive` – upload bestanden vanaf een lokale schijf.

## Supabase en Prisma
Supabase levert de Postgres‑database, authenticatie en opslag. Prisma is een optionele ORM bovenop de Supabase‑database. Het schema staat in `Prisma/schema.prisma` en de SQL‑migraties in `supabase/migrations`.

### Migratiestappen
1. Voer Supabase‑migraties uit met:
   ```bash
   npm run db:setup
   ```
2. Controleer de database:
   ```bash
   npm run db:verify
   ```
3. Houd Prisma en Supabase in sync:
   ```bash
   npm run db:sync
   ```
4. Valideer schema‑compliance:
   ```bash
   npm run schema:verify
   ```
5. Na wijzigingen in Prisma:
   ```bash
   npx prisma generate
   npx prisma migrate dev   # of npx prisma db push
   ```

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
