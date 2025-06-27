/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Optimize for large file uploads
  experimental: {
    largePageDataBytes: 128 * 1024, // 128KB
  },
  
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  
  // Image optimization (if needed)
  images: {
    domains: ['xcrsfcwdjxsbmmrqnose.supabase.co'],
    formats: ['image/webp', 'image/avif'],
  },

  // 🔧 FIX: Add webpack configuration for better error handling
  webpack: (config, { isServer }) => {
    // Improve error handling in middleware
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    return config;
  },

  // 🔧 FIX: Add runtime configuration
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
}

module.exports = nextConfig