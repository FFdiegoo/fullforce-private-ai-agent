import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import UserChatModal from '../../components/UserChatModal';
import FeedbackStats from '../../components/FeedbackStats';
import NegativeFeedbackPanel from '../../components/NegativeFeedbackPanel';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  created_at: string;
  two_factor_enabled: boolean;
}

interface Document {
  id: string;
  filename: string;
  uploaded_by: string;
  last_updated: string;
  processed: boolean;
  file_size: number;
  afdeling: string;
  categorie: string;
  storage_path: string;
}

interface PendingDocument extends Document {
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminDashboard() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authChecked) {
      checkAuth();
    }
  }, [authChecked]);

  async function checkAuth() {
    if (authChecked) return;
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Error retrieving user:', userError.message);
        setError('Authenticatie mislukt. Probeer opnieuw.');
        router.push('/login');
        return;
      }

      if (!user) {
        console.log('No user found, redirecting to login');
        router.push('/login');
        return;
      }

      setCurrentUser(user);
      const email = user.email?.toLowerCase();
      console.log('Current user:', email);

      // Check if user has admin role in app_metadata first
      if (user.app_metadata?.role?.toLowerCase() === 'admin') {
        console.log('User has admin role in auth metadata');
        setIsAdmin(true);
        await fetchData();
        return;
      }

      // Then check profiles table by email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError.message);
        setError('Profiel kon niet worden opgehaald.');
        router.push('/select-assistant');
        return;
      }

      if (!profile || profile.role?.toLowerCase() !== 'admin') {
        console.log('User is not admin, redirecting');
        router.push('/select-assistant');
        return;
      }

      console.log('User is admin, loading dashboard');
      setIsAdmin(true);
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Auth check error:', message);
      setError('Onverwachte authenticatiefout.');
    } finally {
      setAuthChecked(true);
      setLoading(false);
    }
  }

  async function fetchData() {
    try {
      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('Error fetching users:', usersError);
      } else if (usersData) {
        setUsers(usersData);
      }

      // Fetch documents
      const { data: docsData } = await supabase
        .from('documents_metadata')
        .select('*')
        .order('last_updated', { ascending: false });

      if (docsData) {
        const pendingDocs = docsData.map(doc => ({
          ...doc,
          status: doc.processed ? 'approved' : 'pending'
        })) as PendingDocument[];
        setDocuments(pendingDocs);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail) {
      setInviteMessage('Email is vereist');
      setInviteSuccess(false);
      return;
    }
    try {
      setInviteLoading(true);
      setInviteMessage(null);
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) {
        setInviteMessage('Geen sessie gevonden');
        setInviteSuccess(false);
        return;
      }
      const response = await fetch('/api/admin/create-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ email: inviteEmail, name: inviteName })
      });
      const data = await response.json();
      if (response.ok) {
        setInviteSuccess(true);
        setInviteMessage('Invite succesvol verzonden!');
        setInviteEmail('');
        setInviteName('');
      } else {
        setInviteSuccess(false);
        setInviteMessage(data.error || 'Verzenden mislukt');
      }
    } catch (error) {
      console.error('Invite error:', error);
      setInviteSuccess(false);
      setInviteMessage('Verzenden mislukt');
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleDocumentAction(documentId: string, action: 'approve' | 'reject') {
    try {
      if (action === 'approve') {
        // Mark as processed and ready for indexing
        const { error } = await supabase
          .from('documents_metadata')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString(),
            ready_for_indexing: true
          })
          .eq('id', documentId);

        if (error) throw error;

        // Update local state
        setDocuments(prev => 
          prev.map(doc => 
            doc.id === documentId 
              ? { ...doc, status: 'approved', processed: true }
              : doc
          )
        );

        alert('Document goedgekeurd! Het wordt nu verwerkt voor de AI.');
      } else {
        // Delete document
        const document = documents.find(d => d.id === documentId);
        if (document) {
          // Delete from storage
          await supabase.storage
            .from('company-docs')
            .remove([document.storage_path]);

          // Delete from database
          await supabase
            .from('documents_metadata')
            .delete()
            .eq('id', documentId);

          // Update local state
          setDocuments(prev => prev.filter(doc => doc.id !== documentId));
          
          alert('Document afgekeurd en verwijderd.');
        }
      }
    } catch (error) {
      console.error('Error handling document action:', error);
      alert('Er is een fout opgetreden bij het verwerken van het document.');
    }
  }

  function toggleDocumentSelection(id: string) {
    setSelectedDocs(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  }

  function selectAllDocuments() {
    const allPending = documents.filter(d => d.status === 'pending').map(d => d.id);
    setSelectedDocs(allPending);
  }

  async function approveSelectedDocuments() {
    for (const id of selectedDocs) {
      try {
        await supabase
          .from('documents_metadata')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            ready_for_indexing: true
          })
          .eq('id', id);

        setDocuments(prev =>
          prev.map(doc =>
            doc.id === id ? { ...doc, status: 'approved', processed: true } : doc
          )
        );

        await new Promise(res => setTimeout(res, 1000));
      } catch (error) {
        console.error('Error approving document', id, error);
      }
    }

    alert(`${selectedDocs.length} documenten goedgekeurd. Ze worden nu langzaam verwerkt.`);
    setSelectedDocs([]);
  }

  function openChatModal(user: User) {
    setSelectedUser(user);
    setShowChatModal(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading admin dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  const pendingDocuments = documents.filter(d => d.status === 'pending');
  const usersWithout2FA = users.filter(u => !u.two_factor_enabled);

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Red admin indicator - top right */}
      {isAdmin && (
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center space-x-2 bg-red-600 text-white px-3 py-1 rounded-full shadow-lg">
            <span className="w-2 h-2 bg-white rounded-full"></span>
            <span className="text-sm font-medium">Admin</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <Image src="/csrental-logo.svg" alt="CSRental logo" width={96} height={96} className="mr-3" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600 mt-1">Beheer gebruikers en documenten</p>
              {currentUser && (
                <p className="text-sm text-gray-500 mt-1">Ingelogd als: {currentUser.email}</p>
              )}
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => router.push('/admin/create-diego-complete')}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              👨‍💻 Create Complete Diego
            </button>
            <button
              onClick={() => router.push('/admin/create-marketing-admin')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              👤 Create Marketing Admin
            </button>
            <button
              onClick={() => router.push('/admin/create-diego-admin')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              👨‍💻 Create Diego Admin
            </button>
            <button
              onClick={() => router.push('/admin/user-management')}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              👥 User Management
            </button>
            <button
              onClick={() => router.push('/select-assistant')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Terug naar Chat
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-blue-600 text-xl">👥</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Gebruikers</p>
                <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-green-600 text-xl">🛡️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">2FA Actief</p>
                <p className="text-2xl font-bold text-gray-900">
                  {users.filter(u => u.two_factor_enabled).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <span className="text-red-600 text-xl">⚠️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Geen 2FA</p>
                <p className="text-2xl font-bold text-gray-900">{usersWithout2FA.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-yellow-600 text-xl">⏳</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Wachtend</p>
                <p className="text-2xl font-bold text-gray-900">{pendingDocuments.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <span className="text-purple-600 text-xl">📄</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Totaal Docs</p>
                <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
              </div>
            </div>
          </div>

          {/* Feedback Stats Card */}
          <FeedbackStats />
        </div>

        {/* Invite Form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Nodig gebruiker uit</h2>
          <form onSubmit={handleSendInvite} className="flex flex-col sm:flex-row gap-4">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email"
              className="flex-1 p-2 border rounded-md"
            />
            <input
              type="text"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
              placeholder="Naam (optioneel)"
              className="flex-1 p-2 border rounded-md"
            />
            <button
              type="submit"
              disabled={inviteLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {inviteLoading ? 'Versturen...' : 'Verstuur invite'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/user-management')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Beheer invites
            </button>
          </form>
          {inviteMessage && (
            <p className={`mt-4 text-sm ${inviteSuccess ? 'text-green-600' : 'text-red-600'}`}>
              {inviteMessage}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Users Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center">
                <span className="mr-2">👥</span>
                Gebruikers ({users.length})
              </h2>
              <button
                onClick={() => router.push('/admin/user-management')}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Beheer →
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {users.slice(0, 10).map((user) => (
                <div
                  key={user.id}
                  onClick={() => openChatModal(user)}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {user.name || user.email}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      user.role?.toLowerCase() === 'admin'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role}
                    </span>
                    {!user.two_factor_enabled && (
                      <span className="text-red-500 text-xs">⚠️</span>
                    )}
                    <span className="text-gray-400">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Document Review Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center">
                <span className="mr-2">📄</span>
                Document Review
                {pendingDocuments.length > 0 && (
                  <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                    {pendingDocuments.length} nieuw
                  </span>
                )}
              </h2>
              {pendingDocuments.length > 0 && (
                <div className="flex space-x-2">
                  <button
                    onClick={selectAllDocuments}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Selecteer alles
                  </button>
                  <button
                    onClick={approveSelectedDocuments}
                    disabled={selectedDocs.length === 0}
                    className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Goedkeur selectie
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {documents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Geen documenten gevonden
                </div>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`p-4 rounded-lg border-2 ${
                      doc.status === 'pending'
                        ? 'border-yellow-200 bg-yellow-50'
                        : 'border-green-200 bg-green-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start flex-1">
                        {doc.status === 'pending' && (
                          <input
                            type="checkbox"
                            className="mr-2 mt-1"
                            checked={selectedDocs.includes(doc.id)}
                            onChange={() => toggleDocumentSelection(doc.id)}
                          />
                        )}
                        <div>
                          <div className="font-medium text-gray-900 mb-1">
                            {doc.filename}
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            Uploader: {doc.uploaded_by}
                          </div>
                          <div className="text-xs text-gray-500">
                            {doc.afdeling} • {doc.categorie} • {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {format(new Date(doc.last_updated), 'dd-MM-yyyy HH:mm')}
                          </div>
                        </div>
                      </div>

                      {doc.status === 'pending' && (
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => handleDocumentAction(doc.id, 'approve')}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                            title="Goedkeuren"
                          >
                            ✅
                          </button>
                          <button
                            onClick={() => handleDocumentAction(doc.id, 'reject')}
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                            title="Afkeuren"
                          >
                            ❌
                          </button>
                        </div>
                      )}

                      {doc.status === 'approved' && (
                        <div className="ml-4">
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                            Goedgekeurd
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Negative Feedback Panel */}
          <NegativeFeedbackPanel 
            onFeedbackViewed={() => {
              // Refresh stats when feedback is viewed
              console.log('Feedback viewed, stats will refresh automatically');
            }}
          />
        </div>

        {/* Security Alerts */}
        {usersWithout2FA.length > 0 && (
          <div className="mt-8 bg-red-50 border border-red-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-800 mb-4">
              ⚠️ Security Alert: Users without 2FA
            </h3>
            <p className="text-red-700 mb-4">
              {usersWithout2FA.length} gebruiker(s) hebben nog geen 2FA ingesteld. Dit is een beveiligingsrisico.
            </p>
            <div className="flex flex-wrap gap-2">
              {usersWithout2FA.slice(0, 5).map((user) => (
                <span key={user.id} className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm">
                  {user.name || user.email}
                </span>
              ))}
              {usersWithout2FA.length > 5 && (
                <span className="text-red-600 text-sm">
                  +{usersWithout2FA.length - 5} meer...
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chat Modal */}
      {showChatModal && selectedUser && (
        <UserChatModal
          user={selectedUser}
          onClose={() => {
            setShowChatModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}