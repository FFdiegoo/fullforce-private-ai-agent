export interface DocumentMetadata {
  id: string;
  filename: string;
  safe_filename: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  afdeling: string;
  categorie: string;
  onderwerp: string;
  versie: string;
  uploaded_by: string;
  last_updated: string; // ISO-datum als string
  extractedText?: string; // Added field for pre-extracted text
}

export type Embedding = number[]; // vector van floats

export interface TextChunk {
  content: string;
  metadata: any; // DocumentMetadata or subset
  chunk_index: number;
  embedding?: Embedding; // optioneel: alleen als AI embedding is gegenereerd
}

export interface ProcessingOptions {
  chunkSize: number;       // max lengte van een chunk
  chunkOverlap: number;    // overlap tussen chunks
  skipExisting: boolean;   // skip als al in DB
}