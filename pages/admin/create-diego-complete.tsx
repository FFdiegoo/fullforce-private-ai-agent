import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function CreateDiegoComplete() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function createDiegoCompleteUser() {
    try {
      setLoading(true);
      setError('');
      setResult(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/create-diego-complete', {
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
      console.error('Create Diego complete user error:', error);
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
    if (!result?.loginCredentials) return;
    
    const message = `Hoi Diego! 👋

Je complete admin account voor CSrental AI is aangemaakt! 🎉

📧 Email: ${result.loginCredentials.email}
🔑 Wachtwoord: ${result.loginCredentials.password}
👤 Naam: Diego  
📱 Telefoon: 0614759664
🛡️ Role: Admin
🆔 UUID: ${result.user.id}

🔗 Direct inloggen:
${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login

⚠️ Belangrijk na inloggen:
• Je MOET 2FA instellen voor volledige toegang
• Scan de QR-code met Google Authenticator
• Bewaar je backup codes veilig
• Verander je wachtwoord na eerste login

🚀 Na 2FA setup heb je volledige admin toegang!

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
              Create Complete Diego User
            </h1>
            <p className="text-gray-600">
              Create complete admin account for Diego with all credentials
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
                ✅ Diego Complete Account Created Successfully!
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    User Details:
                  </label>
                  <div className="bg-white p-3 rounded border">
                    <p><strong>UUID:</strong> {result.user.id}</p>
                    <p><strong>Email:</strong> {result.user.email}</p>
                    <p><strong>Name:</strong> {result.user.name}</p>
                    <p><strong>Phone:</strong> {result.user.phone}</p>
                    <p><strong>Role:</strong> {result.user.role}</p>
                    <p><strong>2FA Enabled:</strong> {result.user.two_factor_enabled ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    Login Credentials:
                  </label>
                  <div className="bg-white p-3 rounded border">
                    <p><strong>Email:</strong> {result.loginCredentials.email}</p>
                    <p><strong>Password:</strong> {result.loginCredentials.password}</p>
                  </div>
                  <div className="flex space-x-2 mt-2">
                    <button
                      onClick={() => copyToClipboard(`Email: ${result.loginCredentials.email}\nPassword: ${result.loginCredentials.password}`)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      📋 Copy Credentials
                    </button>
                    <button
                      onClick={sendWhatsAppMessage}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                    >
                      📱 Send via WhatsApp
                    </button>
                  </div>
                </div>

                {result.magicLink && (
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">
                      Magic Link (optional - for direct 2FA setup):
                    </label>
                    <div className="bg-white p-3 rounded border break-all text-sm">
                      {result.magicLink}
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.magicLink)}
                      className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      📋 Copy Magic Link
                    </button>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <h4 className="font-medium text-blue-800 mb-2">📧 Instructions for Diego:</h4>
                  <ol className="text-sm text-blue-700 space-y-1">
                    <li>1. Go to the login page</li>
                    <li>2. Use the email and password provided</li>
                    <li>3. Complete 2FA setup (mandatory)</li>
                    <li>4. Scan QR-code with Google Authenticator</li>
                    <li>5. Download and save backup codes</li>
                    <li>6. Access admin dashboard after 2FA setup</li>
                  </ol>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">🔐 Security Notes:</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Account is ready for immediate login</li>
                    <li>• 2FA setup is mandatory before full access</li>
                    <li>• User has full admin privileges after 2FA</li>
                    <li>• All actions are logged in audit trail</li>
                    <li>• Recommend password change after first login</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              onClick={createDiegoCompleteUser}
              disabled={loading || result}
              className={`flex-1 py-3 px-6 rounded-lg font-medium transition-colors ${
                loading || result
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {loading ? 'Creating Complete User...' : result ? 'User Created ✅' : 'Create Complete Diego User'}
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
                onClick={() => window.open(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`, '_blank')}
                className="block w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                🚀 Test Login Page
              </button>
              
              <div className="text-sm text-gray-600">
                <p>💡 <strong>Tip:</strong> Use WhatsApp button to send Diego all login details!</p>
                <p>🔑 <strong>Direct Login:</strong> Email + Password → 2FA Setup → Admin Access</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}