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

      console.log('🚀 Starting Diego user creation...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      console.log('📡 Calling API...');
      const response = await fetch('/api/admin/create-diego-complete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', response.status);
      const data = await response.json();
      console.log('📡 Response data:', data);

      if (response.ok) {
        setResult(data);
        console.log('✅ User created successfully!');
      } else {
        setError(data.error || 'Failed to create user');
        console.error('❌ API Error:', data);
      }

    } catch (error) {
      console.error('❌ Create Diego complete user error:', error);
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
    
    const message = `🎉 CSrental AI Account Ready!

Hoi Diego! Je admin account is aangemaakt:

📧 Email: ${result.loginCredentials.email}
🔑 Tijdelijk Wachtwoord: ${result.loginCredentials.password}
👤 Naam: Diego  
📱 Telefoon: 0614759664
🛡️ Role: Admin

🔗 Login hier:
${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/login

⚠️ Na inloggen:
1. Verplichte 2FA setup
2. Scan QR-code met Google Authenticator  
3. Bewaar backup codes
4. Wijzig je wachtwoord (aanbevolen)
5. Volledige admin toegang!

💡 Tip: Wijzig je wachtwoord na eerste login voor extra beveiliging.

Groeten,
CSrental AI Team`;

    const whatsappUrl = `https://wa.me/31614759664?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const testLogin = () => {
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
    window.open(loginUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🚀 Create Complete Diego User
            </h1>
            <p className="text-gray-600">
              Create complete admin account for Diego with secure credentials
            </p>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Target:</strong> diego.a.scognamiglio@gmail.com<br />
                <strong>UUID:</strong> 900098f4-785e-4c26-8a7b-55135f83bb16<br />
                <strong>Role:</strong> Admin<br />
                <strong>Security:</strong> Secure temporary password generated
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600 text-sm font-medium">❌ Error:</p>
              <p className="text-red-600 text-sm">{error}</p>
              <button
                onClick={() => {
                  setError('');
                  createDiegoCompleteUser();
                }}
                className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
              >
                🔄 Retry
              </button>
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
                    👤 User Details:
                  </label>
                  <div className="bg-white p-3 rounded border">
                    <p><strong>UUID:</strong> {result.user.id}</p>
                    <p><strong>Email:</strong> {result.user.email}</p>
                    <p><strong>Name:</strong> {result.user.name}</p>
                    <p><strong>Phone:</strong> {result.user.phone}</p>
                    <p><strong>Role:</strong> {result.user.role}</p>
                    <p><strong>2FA Enabled:</strong> {result.user.two_factor_enabled ? 'Yes' : 'No (will setup after login)'}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    🔑 Login Credentials:
                  </label>
                  <div className="bg-white p-3 rounded border">
                    <p><strong>Email:</strong> {result.loginCredentials.email}</p>
                    <p><strong>Temporary Password:</strong> <code className="bg-gray-100 px-1 rounded">{result.loginCredentials.password}</code></p>
                    <p className="text-xs text-primary mt-1">⚠️ {result.loginCredentials.note}</p>
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

                {result.resetLink && (
                  <div>
                    <label className="block text-sm font-medium text-green-700 mb-2">
                      🔗 Password Reset Link (optional - direct 2FA setup):
                    </label>
                    <div className="bg-white p-3 rounded border break-all text-sm">
                      {result.resetLink}
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.resetLink)}
                      className="mt-2 px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      📋 Copy Reset Link
                    </button>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <h4 className="font-medium text-blue-800 mb-2">📋 Instructions for Diego:</h4>
                  <ol className="text-sm text-blue-700 space-y-1">
                    <li>1. Go to the login page</li>
                    <li>2. Use email: <code>{result.loginCredentials.email}</code></li>
                    <li>3. Use temporary password: <code>{result.loginCredentials.password}</code></li>
                    <li>4. Complete mandatory 2FA setup</li>
                    <li>5. Scan QR-code with Google Authenticator</li>
                    <li>6. Download and save backup codes</li>
                    <li>7. Change password (recommended)</li>
                    <li>8. Access admin dashboard</li>
                  </ol>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">🔐 Security Notes:</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Account is ready for immediate login</li>
                    <li>• Secure temporary password generated</li>
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
              {loading ? '⏳ Creating Complete User...' : result ? '✅ User Created!' : '🚀 Create Complete Diego User'}
            </button>

            <button
              onClick={() => router.push('/admin')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Back to Admin
            </button>
          </div>

          {result && (
            <div className="mt-6 space-y-3">
              <button
                onClick={testLogin}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                🧪 Test Login Page
              </button>
              
              <div className="text-center text-sm text-gray-600 space-y-1">
                <p>💡 <strong>Tip:</strong> Use WhatsApp button to send Diego all details!</p>
                <p>🔄 <strong>Flow:</strong> Email + Temp Password → 2FA Setup → Password Change → Admin Access</p>
                <p>📱 <strong>WhatsApp:</strong> 0614759664</p>
                <p>🔐 <strong>Security:</strong> Temporary password auto-generated</p>
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">🎯 What this will do:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Generate secure temporary password</li>
                <li>• Clean up any existing conflicting records</li>
                <li>• Create auth user with specific UUID</li>
                <li>• Create profile with all columns filled</li>
                <li>• Set admin role and permissions</li>
                <li>• Generate password reset link for 2FA setup</li>
                <li>• Provide WhatsApp message for Diego</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}