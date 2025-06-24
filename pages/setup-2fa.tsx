'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'

export default function Setup2FAPage() {
  const [step, setStep] = useState(1)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [secret, setSecret] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/login')
        return
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', session.user.email)
        .single()

      if (profile?.two_factor_enabled) {
        router.push('/select-assistant')
        return
      }

      setUser(profile)
      initiate2FASetup(session.access_token)
    } catch (error) {
      console.error('Auth check error:', error)
      router.push('/login')
    }
  }

  const initiate2FASetup = async (accessToken: string) => {
    try {
      setLoading(true)
      setError('')
      
      console.log('Initiating 2FA setup...')
      
      const response = await fetch('/api/auth/setup-2fa', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Response error:', errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('2FA setup data received:', { hasQrCode: !!data.qrCodeUrl, hasSecret: !!data.secret })
      
      setQrCodeUrl(data.qrCodeUrl)
      setBackupCodes(data.backupCodes)
      setSecret(data.secret)
    } catch (error) {
      console.error('2FA setup error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout'
      setError(`2FA setup mislukt: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  const verify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Voer een geldige 6-cijferige code in')
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
        setError(errorData.error || 'Verificatie mislukt')
      }
    } catch (error) {
      console.error('2FA verification error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout'
      setError(`Verificatie mislukt: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Gekopieerd naar klembord')
  }

  const downloadBackupCodes = () => {
    const content = `CSrental AI - 2FA Backup Codes
Gegenereerd op: ${new Date().toLocaleString('nl-NL')}
Account: ${user?.email}

BELANGRIJK: Bewaar deze codes op een veilige plaats!
Elke code kan slechts één keer worden gebruikt.

${backupCodes.map((code, index) => `${index + 1}. ${code}`).join('\n')}

Deze codes kunnen worden gebruikt als u geen toegang heeft tot uw authenticator app.
`

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `csrental-2fa-backup-codes-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    alert('Backup codes gedownload')
  }

  if (loading && !qrCodeUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">2FA instellen...</p>
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
            Two-Factor Authentication Instellen
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Stap {step} van 3: Extra beveiliging voor uw account
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                1. Scan QR Code
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Scan deze QR code met uw authenticator app (Google Authenticator, Authy, etc.)
              </p>
              
              {qrCodeUrl ? (
                <div className="flex justify-center mb-4">
                  <img src={qrCodeUrl} alt="2FA QR Code" className="border rounded-lg" />
                </div>
              ) : (
                <div className="flex justify-center mb-4">
                  <div className="w-48 h-48 bg-gray-100 border rounded-lg flex items-center justify-center">
                    <span className="text-gray-500">QR Code wordt geladen...</span>
                  </div>
                </div>
              )}

              {secret && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-2">Of voer deze code handmatig in:</p>
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
              disabled={!qrCodeUrl}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Volgende: Code Verifiëren
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                2. Verifieer Code
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Voer de 6-cijferige code in die wordt getoond in uw authenticator app
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
                Terug
              </button>
              <button
                onClick={verify2FA}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1 bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? 'Verifiëren...' : 'Verifiëren'}
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
                  2FA Succesvol Ingeschakeld!
                </h3>
                <p className="text-sm text-gray-600">
                  Uw account is nu extra beveiligd met two-factor authentication
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex">
                  <span className="text-yellow-600 text-lg mr-3">⚠️</span>
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">
                      Backup Codes Bewaren
                    </h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Bewaar deze backup codes op een veilige plaats. U kunt ze gebruiken als u geen toegang heeft tot uw authenticator app.
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
                  📋 Kopiëren
                </button>
                <button
                  onClick={downloadBackupCodes}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                >
                  💾 Downloaden
                </button>
              </div>
            </div>

            <button
              onClick={() => router.push('/select-assistant')}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Ga naar Dashboard
            </button>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={() => router.push('/select-assistant')}
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            Later instellen (niet aanbevolen)
          </button>
        </div>
      </div>
    </div>
  )
}