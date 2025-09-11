import { useRouter } from 'next/router';
import ThemeToggle from '../components/ThemeToggle';

export default function SelectAssistant() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700 flex items-center justify-center p-6 relative">
      <div className="fixed top-4 left-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <button
            onClick={() => router.push('/chat?mode=technical')}
            className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg rounded-3xl shadow-xl p-8 hover:transform hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative z-10">
              <div className="bg-blue-500/10 rounded-2xl w-16 h-16 flex items-center justify-center mb-6">
                <span className="text-2xl">🔧</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                CeeS
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                Your Technical Knowledge Expert
              </p>
              <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
                Start Chat
                <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </button>
          <button
            onClick={() => router.push('/chat?mode=procurement')}
            className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg rounded-3xl shadow-xl p-8 hover:transform hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative z-10">
              <div className="bg-purple-500/10 rounded-2xl w-16 h-16 flex items-center justify-center mb-6">
                <span className="text-2xl">📦</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                ChriS
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                Your Procurement & Parts Specialist
              </p>
              <div className="flex items-center text-purple-600 dark:text-purple-400 font-medium">
                Start Chat
                <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
