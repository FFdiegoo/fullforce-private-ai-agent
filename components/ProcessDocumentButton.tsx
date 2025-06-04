import { useState } from 'react';

interface ProcessDocumentButtonProps {
  documentId: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export default function ProcessDocumentButton({
  documentId,
  onSuccess,
  onError
}: ProcessDocumentButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcess = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/process-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        throw new Error('Failed to process document');
      }

      onSuccess?.();
    } catch (error) {
      console.error('Error processing document:', error);
      onError?.(error as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onClick={handleProcess}
      disabled={isProcessing}
      className={`px-4 py-2 rounded-lg text-sm font-medium ${
        isProcessing
          ? 'bg-gray-300 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700 text-white'
      }`}
    >
      {isProcessing ? 'Processing...' : 'Process Document'}
    </button>
  );
}