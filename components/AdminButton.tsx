import Link from 'next/link';

export default function AdminButton() {
  const visible = process.env.NEXT_PUBLIC_PUBLIC_ADMIN === 'true' || process.env.PUBLIC_ADMIN === 'true';
  if (!visible) return null;

  return (
    <Link
      href="/admin"
      className="fixed bottom-4 right-4 bg-gradient-to-r from-green-700 to-green-900 text-green-200 rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-50"
      title="Admin Dashboard"
    >
      <span className="sr-only">Open Admin Dashboard</span>
      ⚙️
    </Link>
  );
}
