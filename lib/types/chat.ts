// Chat-related types
export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  modelUsed?: string;
  createdAt: Date;
  sessionId: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  mode: 'technical' | 'procurement';
  createdAt: Date;
  updatedAt: Date;
  messages?: ChatMessage[];
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  sessionId: string;
  userId: string;
  feedbackType: 'thumbs_up' | 'thumbs_down';
  viewedByAdmin: boolean;
  createdAt: Date;
}

export type ChatMode = 'technical' | 'procurement';
export type ModelType = 'simple' | 'complex';
export type FeedbackType = 'thumbs_up' | 'thumbs_down';