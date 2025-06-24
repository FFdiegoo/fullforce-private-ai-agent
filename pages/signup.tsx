'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { InviteSystem } from '../lib/invite-system'

interface InviteData {
  id: string;
  email: string;
  name: string;
  phone?: string;
  inviteCode: string;
  expiresAt: string;
  used: boolean;
  createdBy: string;
  createdAt: string;
}

export default function SignupPage() {
  const router = useRouter()
  const { invite: inviteCode } = router.query
  
  const [step, setStep] = useState(1) // 1: Validate invite, 2: Email verification, 3: Create password, 4: Success
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)

  useEffect(() => {
    if (inviteCode && typeof inviteCode === 'string') {
      validateInvite(inviteCode)
    } else {
      setError('Invalid or missing invite code')
    }
  }, [inviteCode])

  const validateInvite = async (code: string) => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/auth/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Invalid invite')
      }

      setInvite(data.invite)
      setStep(2) // Move to email verification

    } catch (error) {
      console.error('Invite validation error:', error)
      setError(error instanceof Error ? error.message : 'Invalid invite code')
    } finally {
      setLoading(false)
    }
  }

  const sendVerificationCode = async () => {
    if (!invite) return

    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code')
      }

      alert('Verification code sent to your email!')

    } catch (error) {
      console.error('Send verification error:', error)
      setError(error instanceof Error ? error.message : 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  const verifyEmail = async () => {
    if (!invite || !verificationCode) return

    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/auth/verify-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: invite.email, 
          code: verificationCode 
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code')
      }

      setEmailVerified(true)
      setStep(3) // Move to password creation

    } catch (error) {
      console.error('Email verification error:', error)
      setError(error instanceof Error ? error.message : 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const createAccount = async () => {
    if (!invite || !password || !confirmPassword) return

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          inviteCode: invite.inviteCode,
          password 
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account')
      }

      setStep(4) // Success

    } catch (error) {
      console.error('Account creation error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  if (loading && !invite && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Validating invitation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 text-xl">🎉</span>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Welcome to CSrental AI
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Step {step} of 4: Complete your registration
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600 text-sm">{error}</p>
            {step === 1 && (
              <button
                onClick={() => router.push('/login')}
                className="mt-2 text-sm text-red-700 underline"
              >
                Go to Login
              </button>
            )}
          </div>
        )}

        {/* Step 1: Invite Validation (handled automatically) */}
        
        {/* Step 2: Email Verification */}
        {step === 2 && invite && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Verify Your Email
              </h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Welcome, {invite.name}!</strong><br />
                  We'll send a verification code to: <strong>{invite.email}</strong>
                </p>
              </div>
              
              <button
                onClick={sendVerificationCode}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium mb-4"
              >
                {loading ? 'Sending...' : 'Send Verification Code'}
              </button>

              <div className="space-y-4">
                <input
                  type="text"
                  maxLength={6}
                  className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading}
                />
                
                <button
                  onClick={verifyEmail}
                  disabled={loading || verificationCode.length !== 6}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Create Password */}
        {step === 3 && invite && emailVerified && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create Your Password
              </h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-green-800">
                  ✅ Email verified successfully!
                </p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    Password must be at least 8 characters long
                  </p>
                </div>
                
                <button
                  onClick={createAccount}
                  disabled={loading || !password || !confirmPassword || password !== confirmPassword}
                  className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
              <span className="text-4xl mb-4 block">🎉</span>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Account Created Successfully!
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Your account has been created. You'll now need to set up two-factor authentication for security.
              </p>
              
              <button
                onClick={() => router.push('/login')}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Continue to Login
              </button>
            </div>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  )
}