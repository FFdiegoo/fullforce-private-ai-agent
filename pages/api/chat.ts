import { NextApiRequest, NextApiResponse } from 'next';

// TEMP DISABLED: RAG pipeline was removed
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(503).json({ 
    error: "Chat endpoint temporarily disabled",
    message: "RAG pipeline is being rebuilt. Please use the enhanced chat endpoints instead." 
  });
}