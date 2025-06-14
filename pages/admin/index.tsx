import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';
import UserChatModal from '../../components/UserChatModal';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  created_at: string;
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

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found, redirecting to login');
        router.push('/login');
        return;
      }

      setCurrentUser(user);
      console.log('Current user:', user.email);

      // Check if user exists in profiles table
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', user.email)
        .single();

      if (profileError || !profile) {
        console.log('Profile not found, creating admin profile for:', user.email);
        
        // Create admin profile if it doesn't exist and email is admin@csrental.nl
        if (user.email === 'admin@csrental.nl') {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              email: user.email,
              name: 'Admin User',
              role: 'admin'
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating admin profile:', insertError);
            router.push('/select-assistant');
            return;
          }
          
          profile = newProfile;
          console.log('Created admin profile:', profile);
        } else {
          console.log('Not admin email, redirecting');
          router.push('/select-assistant');
          return;
        }
      }

      console.log('User profile:', profile);

      if (profile.role !== 'admin') {
        console.log('User is not admin, redirecting');
        router.push('/select-assistant');
        return;
      }

      setIsAdmin(true);
      await fetchData();
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  }

  async function fetchData() {
    try {
      // Fetch users (create dummy users if none exist)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('Error fetching users:', usersError);
      } else if (usersData && usersData.length > 0) {
        setUsers(usersData);
      } else {
        // Create dummy users if none exist
        await createDummyUsers();
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

  async function createDummyUsers() {
    const dummyUsers = [
      { id: '11111111-1111-1111-1111-111111111111', email: 'john.doe@csrental.nl', name: 'John Doe', role: 'user' },
      { id: '22222222-2222-2222-2222-222222222222', email: 'jane.smith@csrental.nl', name: 'Jane Smith', role: 'user' },
      { id: '33333333-3333-3333-3333-333333333333', email: 'mike.johnson@csrental.nl', name: 'Mike Johnson', role: 'user' },
      { id: '44444444-4444-4444-4444-444444444444', email: 'sarah.wilson@csrental.nl', name: 'Sarah Wilson', role: 'user' },
      { id: '55555555-5555-5555-5555-555555555555', email: 'david.brown@csrental.nl', name: 'David Brown', role: 'user' },
      { id: '66666666-6666-6666-6666-666666666666', email: 'lisa.davis@csrental.nl', name: 'Lisa Davis', role: 'user' },
      { id: '77777777-7777-7777-7777-777777777777', email: 'tom.miller@csrental.nl', name: 'Tom Miller', role: 'user' },
      { id: '88888888-8888-8888-8888-888888888888', email: 'emma.garcia@csrental.nl', name: 'Emma Garcia', role: 'user' },
      { id: '99999999-9999-9999-9999-999999999999', email: 'alex.martinez@csrental.nl', name: 'Alex Martinez', role: 'user' }
    ];

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert(dummyUsers)
        .select();

      if (!error && data) {
        setUsers(prev => [...prev, ...data]);
      }
    } catch (error) {
      console.error('Error creating dummy users:', error);
    }
  }

  async function handleDocumentAction(documentId: string, action: 'approve' | 'reject') {
    try {
      if (action === 'approve') {
        // Mark as processed
        const { error } = await supabase
          .from('documents_metadata')
          .update({ 
            processed: true, 
            processed_at: new Date().toISOString() 
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
        }
      }
    } catch (error) {
      console.error('Error handling document action:', error);
      alert('Er is een fout opgetreden bij het verwerken van het document.');
    }
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
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600 mt-1">Beheer gebruikers en documenten</p>
            {currentUser && (
              <p className="text-sm text-gray-500 mt-1">Ingelogd als: {currentUser.email}</p>
            )}
          </div>
          <button
            onClick={() => router.push('/select-assistant')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Terug naar Chat
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Users Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center">
              <span className="mr-2">👥</span>
              Gebruikers ({users.length})
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {users.map((user) => (
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
                      user.role === 'admin' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role}
                    </span>
                    <span className="text-gray-400">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents Section */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center">
              <span className="mr-2">📄</span>
              Document Review ({documents.filter(d => d.status === 'pending').length} pending)
            </h2>
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
                        : doc.status === 'approved'
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
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
                      
                      {doc.status !== 'pending' && (
                        <div className="ml-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            doc.status === 'approved' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {doc.status === 'approved' ? 'Goedgekeurd' : 'Afgekeurd'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
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