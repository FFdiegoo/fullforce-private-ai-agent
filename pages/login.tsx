import { useUser } from '@auth0/nextjs-auth0/client';

export default function Login() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span>Even geduld...</span>
      </div>
    );
  }

  if (user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/select-assistant';
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-md p-8 transform transition-all hover:scale-[1.01]">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="mt-3 text-gray-600">Sign in to your account</p>
        </div>
        
        {/* Auth0 login knop in jouw eigen stijl */}
        <a
          href="/api/auth/login"
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl py-3 px-4 hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] font-medium shadow-lg hover:shadow-purple-500/25 flex items-center justify-center"
        >
          Sign in with Auth0
        </a>

        {/* Je kunt hier eventueel een extra uitleg of branding toevoegen */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Je wordt doorgestuurd naar een veilige Auth0-login.
        </div>
      </div>
    </div>
  );
}