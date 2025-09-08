#!/usr/bin/env python3
import os
import sys
import json
import time
from pathlib import Path
from supabase import create_client, Client
import openai
from typing import List, Dict, Any
import logging
from pdfminer.high_level import extract_text as pdf_extract_text
import mammoth
from PIL import Image
import pytesseract

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

if not all([SUPABASE_URL, SUPABASE_KEY, OPENAI_API_KEY]):
    logger.error("Missing required environment variables")
    sys.exit(1)

# Initialize clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openai.api_key = OPENAI_API_KEY

class DocumentIngestor:
    def __init__(self):
        self.chunk_size = 1000
        self.chunk_overlap = 200
        self.batch_size = 10

    def extract_text(self, file_path: Path) -> str:
        """Extract text from various file types using type-specific parsers"""
        ext = file_path.suffix.lower()
        try:
            if ext == '.pdf':
                return pdf_extract_text(str(file_path)) or ''
            elif ext == '.docx':
                with open(file_path, 'rb') as f:
                    result = mammoth.extract_raw_text(f)
                return result.value
            elif ext in {'.png', '.jpg', '.jpeg', '.tiff'}:
                image = Image.open(file_path)
                return pytesseract.image_to_string(image, lang='nld+eng')
            elif ext in {'.txt', '.md'}:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            else:
                logger.warning(f"Unsupported file type: {file_path.suffix}")
                return ''
        except Exception as e:
            logger.error(f"Error extracting text from {file_path}: {e}")
            return ''

    def create_chunks(self, text: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create overlapping chunks from text"""
        sentences = [s.strip() for s in text.split('.') if s.strip()]
        chunks = []
        current_chunk = ""
        current_length = 0

        for sentence in sentences:
            sentence_length = len(sentence)

            if current_length + sentence_length > self.chunk_size and current_chunk:
                # Save current chunk
                chunks.append({
                    'content': current_chunk.strip(),
                    'metadata': {**metadata, 'chunk_index': len(chunks)}
                })

                # Start new chunk with overlap
                words = current_chunk.split()
                overlap_words = words[-20:]  # Last 20 words for overlap
                current_chunk = ' '.join(overlap_words) + '. ' + sentence
                current_length = len(current_chunk)
            else:
                current_chunk += ('. ' if current_chunk else '') + sentence
                current_length = len(current_chunk)

        # Add final chunk
        if current_chunk.strip():
            chunks.append({
                'content': current_chunk.strip(),
                'metadata': {**metadata, 'chunk_index': len(chunks)}
            })

        return chunks

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of texts"""
        try:
            response = openai.Embedding.create(
                model="text-embedding-3-small",
                input=texts
            )
            return [item['embedding'] for item in response['data']]
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise

    def store_chunks(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """Store chunks with embeddings in Supabase"""
        try:
            data_to_insert = []
            for chunk, embedding in zip(chunks, embeddings):
                chunk_meta = chunk['metadata']
                data_to_insert.append({
                    'content': chunk['content'],
                    'metadata': {k: v for k, v in chunk_meta.items() if k != 'chunk_index'},
                    'chunk_index': chunk_meta.get('chunk_index'),
                    'embedding': embedding,
                    'created_at': time.strftime('%Y-%m-%d %H:%M:%S')
                })

            result = supabase.table('document_chunks').insert(data_to_insert).execute()
            logger.info(f"Stored {len(data_to_insert)} chunks")
            return result
        except Exception as e:
            logger.error(f"Error storing chunks: {e}")
            raise

    def process_file(self, file_path: Path) -> bool:
        """Process a single file"""
        try:
            logger.info(f"Processing: {file_path}")

            # Extract text using type-specific parser
            content = self.extract_text(file_path)

            if not content.strip():
                logger.warning(f"Empty file: {file_path}")
                return False

            # Create metadata
            metadata = {
                'source': str(file_path),
                'filename': file_path.name,
                'directory': str(file_path.parent),
                'file_size': len(content)
            }

            # Create chunks
            chunks = self.create_chunks(content, metadata)
            if not chunks:
                logger.warning(f"No chunks created for: {file_path}")
                return False

            # Process in batches
            for i in range(0, len(chunks), self.batch_size):
                batch = chunks[i:i + self.batch_size]
                texts = [chunk['content'] for chunk in batch]

                # Generate embeddings
                embeddings = self.generate_embeddings(texts)

                # Store in database
                self.store_chunks(batch, embeddings)

                # Rate limiting
                time.sleep(0.1)

            logger.info(f"Successfully processed {file_path} ({len(chunks)} chunks)")
            return True

        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
            return False

    def process_directory(self, directory_path: str):
        """Process all supported files in directory and subdirectories"""
        directory = Path(directory_path)
        if not directory.exists():
            logger.error(f"Directory not found: {directory_path}")
            return

        # Find all supported files
        supported_extensions = {'.txt', '.md', '.pdf', '.docx', '.png', '.jpg', '.jpeg', '.tiff'}
        files = []

        for ext in supported_extensions:
            files.extend(directory.rglob(f'*{ext}'))

        logger.info(f"Found {len(files)} files to process")

        processed = 0
        failed = 0

        for file_path in files:
            if self.process_file(file_path):
                processed += 1
            else:
                failed += 1

            # Progress update
            if (processed + failed) % 10 == 0:
                logger.info(f"Progress: {processed} processed, {failed} failed")

        logger.info(f"Completed: {processed} processed, {failed} failed")

def main():
    if len(sys.argv) != 2:
        print("Usage: python ingest.py <directory_path>")
        sys.exit(1)

    directory_path = sys.argv[1]
    ingestor = DocumentIngestor()
    ingestor.process_directory(directory_path)

if __name__ == "__main__":
    main()