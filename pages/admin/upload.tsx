import { useEffect } from 'react';
import { useRouter } from 'next/router';
import UploadForm from '../../components/UploadForm';
import { supabase } from '../../lib/supabaseClient';

export default function UploadPage() {
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Document Upload Portal
          </h1>
          <p className="mt-2 text-gray-600">
            Upload en categoriseer bedrijfsdocumenten
          </p>
        </div>
        <UploadForm />
      </div>
    </div>
  );
}