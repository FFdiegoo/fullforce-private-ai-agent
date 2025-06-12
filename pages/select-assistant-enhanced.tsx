import { useRouter } from 'next/router';

export default function SelectAssistantEnhanced() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
        <button
          onClick={() => router.push('/chat-enhanced?mode=technical')}
          className="group bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl p-8 hover:transform hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="bg-blue-500/10 rounded-2xl w-16 h-16 flex items-center justify-center mb-6">
              <span className="text-2xl">🔧</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              CeeS Enhanced
            </h2>
            <p className="text-gray-600 mb-4 text-lg">
              Your Technical Knowledge Expert
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-green-700">
                <strong>Nieuw:</strong> Keuze tussen GPT-4 Turbo en GPT-o3
              </p>
            </div>
            <div className="flex items-center text-blue-600 font-medium">
              Start Enhanced Chat
              <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </button>

        <button
          onClick={() => router.push('/chat-enhanced?mode=procurement')}
          className="group bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl p-8 hover:transform hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="bg-purple-500/10 rounded-2xl w-16 h-16 flex items-center justify-center mb-6">
              <span className="text-2xl">📦</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              ChriS Enhanced
            </h2>
            <p className="text-gray-600 mb-4 text-lg">
              Your Procurement & Parts Specialist
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-green-700">
                <strong>Nieuw:</strong> Keuze tussen GPT-4 Turbo en GPT-o3
              </p>
            </div>
            <div className="flex items-center text-purple-600 font-medium">
              Start Enhanced Chat
              <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}