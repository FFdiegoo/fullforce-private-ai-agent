'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

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

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      console.log('🔍 Starting auth check...')
      setDebugInfo((prev: DebugInfo) => ({ ...prev, step: 'getting_session' }))
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      console.log('📋 Session check result:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userEmail: session?.user?.email,
        sessionError: sessionError?.message
      })
      
      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        hasSession: !!session,
        userEmail: session?.user?.email,
        sessionError: sessionError?.message
      }))
      
      if (sessionError) {
        console.error('❌ Session error:', sessionError)
        setError(`Session error: ${sessionError.message}`)
        return
      }
      
      if (!session || !session.user) {
        console.log('❌ No valid session, redirecting to login')
        setDebugInfo((prev: DebugInfo) => ({ ...prev, redirectReason: 'no_session' }))
        router.push('/login')
        return
      }

      console.log('✅ Valid session found, checking user profile...')
      setDebugInfo((prev: DebugInfo) => ({ ...prev, step: 'checking_profile' }))

      // Get user profile - with better error handling
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', session.user.email)
        .single()

      console.log('👤 Profile check result:', {
        hasProfile: !!profile,
        profileEmail: profile?.email,
        twoFactorEnabled: profile?.two_factor_enabled,
        profileError: profileError?.message
      })

      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        hasProfile: !!profile,
        profileEmail: profile?.email,
        twoFactorEnabled: profile?.two_factor_enabled,
        profileError: profileError?.message
      }))

      if (profileError) {
        console.error('❌ Profile error:', profileError)
        setError(`Profile error: ${profileError.message}`)
        // Don't redirect on profile error, let user try to set up 2FA anyway
      }

      // Check if 2FA is already enabled
      if (profile?.two_factor_enabled) {
        console.log('✅ 2FA already enabled, redirecting to dashboard')
        setDebugInfo((prev: DebugInfo) => ({ ...prev, redirectReason: '2fa_already_enabled' }))
        router.push('/select-assistant')
        return
      }

      console.log('🎯 2FA not enabled, proceeding with setup')
      setUser(profile || { email: session.user.email })
      setDebugInfo((prev: DebugInfo) => ({ ...prev, step: 'initiating_2fa_setup' }))
      
      // Auto-start 2FA setup when component loads
      await initiate2FASetup(session.access_token)
    } catch (error) {
      console.error('❌ Auth check error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Auth check failed: ${errorMessage}`)
      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        authCheckError: errorMessage,
        step: 'auth_check_failed'
      }))
    }
  }

  const initiate2FASetup = async (accessToken: string) => {
    try {
      setLoading(true)
      setError('')
      
      console.log('🔄 Initiating 2FA setup...')
      setDebugInfo((prev: DebugInfo) => ({ ...prev, step: 'calling_2fa_api' }))
      
      const apiUrl = '/api/auth/setup-2fa'
      const requestMethod = 'POST'
      const authHeaderPresent = !!accessToken
      
      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        apiUrl,
        requestMethod,
        authHeaderPresent
      }))
      
      console.log('📡 Making API request:', {
        url: apiUrl,
        method: requestMethod,
        hasToken: authHeaderPresent,
        tokenLength: accessToken?.length || 0
      })
      
      const response = await fetch(apiUrl, {
        method: requestMethod,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('📡 Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      })
      
      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        apiResponseStatus: response.status,
        apiResponseOk: response.ok
      }))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Response error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        })
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('✅ 2FA setup data received:', { 
        hasQrCode: !!data.qrCodeUrl, 
        hasSecret: !!data.secret,
        backupCodesCount: data.backupCodes?.length || 0,
        qrCodeLength: data.qrCodeUrl?.length || 0
      })
      
      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        hasQrCode: !!data.qrCodeUrl,
        hasSecret: data.secret ? `${data.secret.substring(0, 10)}...` : 'none',
        backupCodesCount: data.backupCodes?.length || 0
      }))
      
      if (!data.qrCodeUrl) {
        throw new Error('QR code niet ontvangen van server')
      }
      
      setQrCodeUrl(data.qrCodeUrl)
      setBackupCodes(data.backupCodes || [])
      setSecret(data.secret)
      
      console.log('🎯 Setup completed successfully')
      
    } catch (error) {
      console.error('❌ 2FA setup error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`2FA setup failed: ${errorMessage}`)
      setDebugInfo((prev: DebugInfo) => ({ 
        ...prev, 
        setupError: errorMessage
      }))
    } finally {
      setLoading(false)
    }
  }

  const verify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Enter a valid 6-digit code')
      return
    }

    try {
      setLoading(true)
      setError('')
      
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/auth/setup-2fa', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          secret,
          token: verificationCode,
          backupCodes
        })
      })

      if (response.ok) {
        setStep(3)
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Verification failed')
      }
    } catch (error) {
      console.error('2FA verification error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Verification failed: ${errorMessage}`)
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

  const retrySetup = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await initiate2FASetup(session.access_token)
    }
  }

  const forceSkipToSetup = () => {
    setUser({ email: 'debug@test.com' })
    setError('')
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
            <div className="flex space-x-2">
              <button
                onClick={retrySetup}
                className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors"
              >
                🔄 Retry
              </button>
              <button
                onClick={forceSkipToSetup}
                className="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded transition-colors"
              >
                🚀 Force Skip (Debug)
              </button>
              <button
                onClick={() => router.push('/login')}
                className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded transition-colors"
              >
                🔑 To Login
              </button>
            </div>
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
                      {!loading && (
                        <button
                          onClick={retrySetup}
                          className="block mt-2 text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          🔄 Reload
                        </button>
                      )}
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