# fullforce-private-ai-agent
Inhouse AI chatbot omgeving voor CS Rental, schaalbaar voor meerdere klanten.

## PDF processing

During the cron job (`pages/api/cron/process-unindexed-documents.ts`), PDFs are parsed to extract text. Some PDFs contain only images and yield no text after parsing. These PDFs are marked as unsupported and skipped; no OCR is currently performed.
