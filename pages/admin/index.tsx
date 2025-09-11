import FeedbackStats from '@/components/FeedbackStats';
import UserInviteForm from '@/components/UserInviteForm';
import PendingDocumentsPanel from '@/components/PendingDocumentsPanel';

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-black text-green-500 p-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FeedbackStats />
        <UserInviteForm />
        <PendingDocumentsPanel className="md:col-span-2" />
      </div>
    </div>
  );
}
