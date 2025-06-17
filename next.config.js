/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Optimize for large file uploads
  experimental: {
    largePageDataBytes: 128 * 1024, // 128KB
  },
  
  // Increase API body size limit for uploads
  api: {
    bodyParser: {
      sizeLimit: '1gb', // 1GB limit
    },
    responseLimit: false,
  },
  
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  
  // Image optimization (if needed)
  images: {
    domains: ['xcrsfcwdjxsbmmrqnose.supabase.co'],
    formats: ['image/webp', 'image/avif'],
  },
}

module.exports = nextConfig