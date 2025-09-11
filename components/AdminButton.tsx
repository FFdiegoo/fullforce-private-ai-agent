import Link from 'next/link';

export default function AdminButton() {
  return (
    <Link
      href="/admin"
      className="fixed bottom-4 right-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-50"
      title="Admin Dashboard"
    >
      <span className="sr-only">Open Admin Dashboard</span>
      ⚙️
    </Link>
  );
}
