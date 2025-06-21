import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Message {
  text: string;
  isUser: boolean;
  modelUsed?: string;
  messageId?: string; // Add message ID for feedback
}

interface ChatSession {
  id: string;
  title: string;
  mode: 'technical' | 'procurement';
  created_at: string;
  updated_at: string;
}

export function useChatSession(mode: 'technical' | 'procurement') {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate a title from the first user message
  const generateTitle = (firstMessage: string): string => {
    const words = firstMessage.split(' ').slice(0, 6);
    return words.join(' ') + (firstMessage.split(' ').length > 6 ? '...' : '');
  };

  // Get user profile ID by email
  const getUserProfileId = async (): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', user.email)
        .single();

      if (error) {
        console.error('Error getting user profile:', error);
        return null;
      }

      return profile?.id || null;
    } catch (error) {
      console.error('Error in getUserProfileId:', error);
      return null;
    }
  };

  // Create a new chat session
  const createNewSession = async (firstMessage: string): Promise<string | null> => {
    try {
      const userId = await getUserProfileId();
      if (!userId) return null;

      const title = generateTitle(firstMessage);

      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          title,
          mode
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating chat session:', error);
        return null;
      }

      console.log('Created new chat session:', data.id);
      return data.id;
    } catch (error) {
      console.error('Error creating chat session:', error);
      return null;
    }
  };

  // Save a message to the current session
  const saveMessage = async (content: string, role: 'user' | 'assistant', modelUsed?: string): Promise<string | null> => {
    if (!currentSessionId) {
      console.warn('No current session ID, cannot save message');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: currentSessionId,
          content,
          role,
          model_used: modelUsed
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving message:', error);
        return null;
      } else {
        console.log('Message saved successfully with ID:', data.id);
        return data.id;
      }
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  };

  // Load messages from a session
  const loadSession = async (sessionId: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const loadedMessages: Message[] = data.map(msg => ({
        text: msg.content,
        isUser: msg.role === 'user',
        modelUsed: msg.model_used,
        messageId: msg.id
      }));

      setMessages(loadedMessages);
      setCurrentSessionId(sessionId);
      console.log('Loaded session:', sessionId, 'with', loadedMessages.length, 'messages');
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  // Start a new chat
  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    console.log('Started new chat');
  };

  // Send a message (handles session creation if needed)
  const sendMessage = async (
    text: string, 
    model: 'simple' | 'complex',
    apiEndpoint: string
  ): Promise<void> => {
    console.log('Sending message:', text);
    
    // Add user message to UI immediately
    const userMessage: Message = { text, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      // Create session if this is the first message
      let sessionId = currentSessionId;
      if (!sessionId) {
        console.log('Creating new session for first message');
        sessionId = await createNewSession(text);
        if (sessionId) {
          setCurrentSessionId(sessionId);
          console.log('New session created:', sessionId);
        } else {
          console.error('Failed to create new session');
        }
      }

      // Save user message
      let userMessageId: string | null = null;
      if (sessionId) {
        userMessageId = await saveMessage(text, 'user');
      }

      // Call API
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, mode, model }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Save assistant message and get its ID
      let assistantMessageId: string | null = null;
      if (sessionId) {
        assistantMessageId = await saveMessage(data.reply, 'assistant', data.modelUsed);
      }

      const assistantMessage: Message = { 
        text: data.reply, 
        isUser: false,
        modelUsed: data.modelUsed,
        messageId: assistantMessageId || undefined
      };

      setMessages(prev => [...prev, assistantMessage]);

      console.log('Message exchange completed successfully');

    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = { 
        text: 'Sorry, er is een fout opgetreden. Probeer het later opnieuw.',
        isUser: false 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return {
    currentSessionId,
    messages,
    loading,
    sendMessage,
    loadSession,
    startNewChat
  };
}