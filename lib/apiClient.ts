import { supabase } from './supabaseClient';

export class ApiClient {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const session = await supabase.auth.getSession();
  
    if (!session.data.session?.access_token) {
      throw new Error('No valid session found');
    }

    return {
      'Authorization': `Bearer ${session.data.session.access_token}`,
      'Content-Type': 'application/json'
    };
  }

  static async post(url: string, data: any) {
    try {
      const headers = await this.getAuthHeaders();
    
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ API call failed:', error);
      throw error;
    }
  }

  static async get(url: string) {
    try {
      const headers = await this.getAuthHeaders();
    
      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('❌ API call failed:', error);
      throw error;
    }
  }
}