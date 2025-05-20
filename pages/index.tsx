import React, { useState } from 'react';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Session } from '@supabase/supabase-js';

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const [session, setSession] = useState<Session | null>(null);

  // Check authentication status
  const { data } = await supabase.auth.getSession();
  setSession(data.session);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Full Force AI Assistant
          </h1>
          <p className="text-xl text-gray-600">
            Uw intelligente partner voor technische en inkoop vragen
          </p>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          
          {/* CeeS Section */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              CeeS - Technische Kennis
            </h2>
            <p className="text-gray-600 mb-4">
              Uw expert voor technische documentatie en ondersteuning
            </p>
            <Link 
              href="/chat?mode=technical" 
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Start Technisch Gesprek
            </Link>
          </div>

          {/* ChriS Section */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              ChriS - Inkoop Assistant
            </h2>
            <p className="text-gray-600 mb-4">
              Uw specialist voor inkoop en leveranciersinformatie
            </p>
            <Link 
              href="/chat?mode=procurement" 
              className="inline-block bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors"
            >
              Start Inkoop Gesprek
            </Link>
          </div>
        </div>

        {/* Admin Section */}
        {session ? (
          <div className="text-center">
            <Link 
              href="/admin/upload" 
              className="inline-block bg-gray-800 text-white px-6 py-2 rounded-md hover:bg-gray-900 transition-colors"
            >
              Beheer Documenten
            </Link>
          </div>
        ) : (
          <div className="text-center">
            <Link 
              href="/login" 
              className="inline-block bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Login voor Beheer
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}