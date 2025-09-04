import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../lib/useAuth'

interface DebugInfo {
  step?: string;
  hasSession?: boolean;
  userEmail?: string;
  sessionError?: string;
  redirectReason?: string;
  hasProfile?: boolean;
  profileEmail?: string;
  twoFactorEnabled?: boolean;
  profileError?: string;
  authCheckError?: string;
  apiResponseStatus?: number;
  apiResponseOk?: boolean;
  hasQrCode?: boolean;
  hasSecret?: string;
  backupCodesCount?: number;
  setupError?: string;
  apiUrl?: string;
  requestMethod?: string;
  authHeaderPresent?: boolean;
  profileCreated?: boolean;
  profileCreationError?: string;
  verificationAttempt?: {
    tokenLength?: number;
    secretLength?: number;
    timestamp?: string;
    serverTime?: string;
    clientTime?: string;
  };
  verificationResponse?: {
    status?: number;
    ok?: boolean;
    error?: string;
  };
}

export default function Setup2FAPage() {
  const [step, setStep] = useState(1)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [secret, setSecret] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState('')
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({})
  const router = useRouter()
  const { user: authUser, loading: authLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !authUser) {
        console.log('❌ No authentication, redirecting to login');
        router.push('/login');
        return;
      }

      // Diego bypass
      if (authUser.email?.toLowerCase() === 'diego.a.scognamiglio@gmail.com') {
        console.log('🔓 Diego detected, redirecting to select-assistant');
        router.push('/select-assistant');
        return;
      }

      checkExisting2FA();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, authUser, router]);

  const checkExisting2FA = async () => {
    if (!authUser) return;

    try {
      console.log('🔍 Checking existing 2FA setup...');
      setDebugInfo(prev => ({ ...prev, step: 'checking_existing_2fa' }));

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', authUser.email)
        .single();

      setDebugInfo(prev => ({
        ...prev,
        hasProfile: !!profile,
        profileEmail: profile?.email,
        twoFactorEnabled: profile?.two_factor_enabled,
        profileError: profileError?.message
      }));

      if (profileError) {
        console.error('❌ Profile error:', profileError);
        setError(`Profile error: ${profileError.message}`);
        return;
      }

      if (profile?.two_factor_enabled) {
        console.log('✅ 2FA already enabled, redirecting...');
        router.push('/select-assistant');
        return;
      }

      console.log('ℹ️ 2FA not enabled, showing setup');
      setUser(authUser);
      await initiate2FASetup();
    } catch (error: any) {
      console.error('❌ 2FA check error:', error);
      setError(`2FA check failed: ${error.message}`);
      setDebugInfo(prev => ({ ...prev, authCheckError: error.message }));
    }
  };

  const initiate2FASetup = async () => {
    try {
      setLoading(true)
      setError('')
      setDebugInfo(prev => ({ ...prev, step: 'calling_2fa_api' }));

      const session = supabase.auth.getSession
        ? (await supabase.auth.getSession()).data.session
        : null;
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError('No session found, please login again.');
        return;
      }

      const response = await fetch('/api/auth/setup-2fa', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      setDebugInfo(prev => ({
        ...prev,
        apiResponseStatus: response.status,
        apiResponseOk: response.ok
      }));

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      setQrCodeUrl(data.qrCodeUrl);
      setBackupCodes(data.backupCodes || []);
      setSecret(data.secret);

      setDebugInfo(prev => ({
        ...prev,
        hasQrCode: !!data.qrCodeUrl,
        hasSecret: data.secret ? `${data.secret.substring(0, 10)}...` : 'none',
        backupCodesCount: data.backupCodes?.length || 0
      }));
    } catch (error: any) {
      setError(`2FA setup failed: ${error.message}`);
      setDebugInfo(prev => ({ ...prev, setupError: error.message }));
    } finally {
      setLoading(false)
    }
  };

  const verify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Enter a valid 6-digit code')
      return
    }

    try {
      setLoading(true)
      setError('')

      const session = supabase.auth.getSession
        ? (await supabase.auth.getSession()).data.session
        : null;
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError('Session expired, please refresh the page');
        return;
      }

      const response = await fetch('/api/auth/setup-2fa', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          secret: secret,
          token: verificationCode,
          backupCodes: backupCodes
        })
      });

      const responseData = await response.json();

      setDebugInfo(prev => ({ 
        ...prev, 
        verificationResponse: {
          status: response.status,
          ok: response.ok,
          error: responseData.error
        }
      }));

      if (response.ok) {
        setStep(3)
      } else {
        setError(responseData.error || 'Verification failed')
      }
    } catch (error: any) {
      setError(`Verification failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard')
  }

  const downloadBackupCodes = () => {
    const content = `CSrental AI - 2FA Backup Codes
Generated on: ${new Date().toLocaleString('en-US')}
Account: ${user?.email}

IMPORTANT: Store these codes in a safe place!
Each code can only be used once.

${backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

These codes can be used if you don't have access to your authenticator app.
`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `csrental-2fa-backup-codes-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    alert('Backup codes downloaded')
  }

  if (loading && !qrCodeUrl && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Setting up 2FA...</p>
          <p className="text-xs text-gray-500 mt-2">Step: {debugInfo.step}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 text-xl">🛡️</span>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Two-Factor Authentication Setup
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Step {step} of 3: Extra security for your account
          </p>
        </div>

        {/* Debug Info Panel */}
        <details className="bg-gray-100 rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            🔍 Debug Info (click to expand)
          </summary>
          <div className="mt-2 text-xs text-gray-600">
            <pre className="whitespace-pre-wrap overflow-auto max-h-40">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        </details>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 text-sm mb-3">{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                1. Scan QR Code
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
              
              {qrCodeUrl ? (
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-white border-2 border-gray-200 rounded-lg">
                    <img 
                      src={qrCodeUrl} 
                      alt="2FA QR Code" 
                      className="w-48 h-48"
                      onLoad={() => console.log('✅ QR Code image loaded successfully')}
                      onError={(e) => {
                        console.error('❌ QR Code image failed to load:', e)
                        setError('QR code could not be loaded')
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center mb-4">
                  <div className="w-48 h-48 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-gray-500 text-sm">QR Code loading...</span>
                    </div>
                  </div>
                </div>
              )}

              {secret && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-2">Or enter this code manually:</p>
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-mono bg-white px-2 py-1 rounded border break-all">
                      {secret}
                    </code>
                    <button
                      onClick={() => copyToClipboard(secret)}
                      className="ml-2 px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs transition-colors"
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!qrCodeUrl || loading}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Next: Verify Code
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                2. Verify Code
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Enter the 6-digit code shown in your authenticator app
              </p>
              
              <input
                type="text"
                maxLength={6}
                className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={loading}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                disabled={loading}
              >
                Back
              </button>
              <button
                onClick={verify2FA}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1 bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-center mb-6">
                <span className="text-4xl mb-4 block">✅</span>
                <h3 className="text-lg font-medium text-gray-900">
                  2FA Successfully Enabled!
                </h3>
                <p className="text-sm text-gray-600">
                  Your account is now protected with two-factor authentication
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex">
                  <span className="text-yellow-600 text-lg mr-3">⚠️</span>
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">
                      Save Backup Codes
                    </h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Store these backup codes in a safe place. You can use them if you don't have access to your authenticator app.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <h4 className="text-sm font-medium text-gray-900">Backup Codes:</h4>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="bg-gray-50 p-2 rounded text-center">
                      <code className="text-sm font-mono">{code}</code>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex space-x-3 mb-6">
                <button
                  onClick={() => copyToClipboard(backupCodes.join('\n'))}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  📋 Copy
                </button>
                <button
                  onClick={downloadBackupCodes}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  💾 Download
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push('/select-assistant')}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={() => router.push('/select-assistant')}
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            Set up later (not recommended)
          </button>
        </div>
      </div>
    </div>
  )
}