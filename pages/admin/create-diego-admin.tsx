import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function CreateDiegoAdmin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function createDiegoUser() {
    try {
      setLoading(true);
      setError('');
      setResult(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/create-diego-user', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Failed to create user');
      }

    } catch (error) {
      console.error('Create Diego user error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const sendWhatsAppMessage = () => {
    if (!result?.magicLink) return;
    
    const message = `Hoi Diego! 👋

Je admin account voor CSrental AI is aangemaakt! 🎉

📧 Email: diego@full-force.ai
👤 Naam: Diego  
📱 Telefoon: 0614759664
🛡️ Role: Admin

🔗 Klik op deze link om je wachtwoord in te stellen en 2FA te activeren:
${result.magicLink}

⚠️ Belangrijk:
• Link verloopt over 1 uur
• Je MOET 2FA instellen voor toegang
• Scan de QR-code met Google Authenticator
• Bewaar je backup codes veilig

Na 2FA setup heb je volledige admin toegang! 🚀

Groeten,
Het CSrental AI Team`;

    const whatsappUrl = `https://wa.me/31614759664?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Create Diego Admin User
            </h1>
            <p className="text-gray-600">
              Create admin account for diego@full-force.ai with magic link
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-green-800 mb-4">
                ✅ Diego Admin Created Successfully!
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    User Details:
                  </label>
                  <div className="bg-white p-3 rounded border">
                    <p><strong>Email:</strong> {result.user.email}</p>
                    <p><strong>Name:</strong> {result.user.name}</p>
                    <p><strong>Phone:</strong> {result.user.phone}</p>
                    <p><strong>Role:</strong> {result.user.role}</p>
                    <p><strong>ID:</strong> {result.user.id}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    Magic Link (for password setup and 2FA):
                  </label>
                  <div className="bg-white p-3 rounded border break-all text-sm">
                    {result.magicLink}
                  </div>
                  <div className="flex space-x-2 mt-2">
                    <button
                      onClick={() => copyToClipboard(result.magicLink)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      📋 Copy Magic Link
                    </button>
                    <button
                      onClick={sendWhatsAppMessage}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                    >
                      📱 Send via WhatsApp
                    </button>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">📧 Instructions for Diego:</h4>
                  <ol className="text-sm text-yellow-700 space-y-1">
                    <li>1. Click the magic link to set your password</li>
                    <li>2. You'll be redirected to 2FA setup automatically</li>
                    <li>3. Scan the QR-code with Google Authenticator</li>
                    <li>4. Download and save your backup codes</li>
                    <li>5. After 2FA setup, you can access the admin dashboard</li>
                  </ol>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <h4 className="font-medium text-blue-800 mb-2">🔐 Security Notes:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Magic link expires in 1 hour</li>
                    <li>• 2FA setup is mandatory before access</li>
                    <li>• User has full admin privileges</li>
                    <li>• All actions are logged in audit trail</li>
                    <li>• Phone: 0614759664 (for WhatsApp contact)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              onClick={createDiegoUser}
              disabled={loading || result}
              className={`flex-1 py-3 px-6 rounded-lg font-medium transition-colors ${
                loading || result
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {loading ? 'Creating User...' : result ? 'User Created ✅' : 'Create Diego Admin'}
            </button>

            <button
              onClick={() => router.push('/admin')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to Admin
            </button>
          </div>

          {result && (
            <div className="mt-6 text-center space-y-3">
              <button
                onClick={() => window.open(result.magicLink, '_blank')}
                className="block w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                🚀 Test Magic Link
              </button>
              
              <div className="text-sm text-gray-600">
                <p>💡 <strong>Tip:</strong> Use the WhatsApp button to send Diego the magic link directly!</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}