# fullforce-private-ai-agent
Inhouse AI chatbot omgeving voor CS Rental, schaalbaar voor meerdere klanten.

## Omgevingsvariabelen

Voor het cron-endpoint moeten de volgende variabelen ingesteld zijn:

- `CRON_API_KEY`
- `CRON_BYPASS_KEY`

Als een van deze ontbreekt, wordt er een fout gelogd en stopt de server of geeft het endpoint een 500-fout terug.
