import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type IPAddress = string;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

export function middleware(req: NextRequest) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // In development, altijd doorlaten
  if (isDevelopment) {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl

  // Public routes die IP check omzeilen
  const publicRoutes = ['/login', '/api/health']
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next()
  }

  // Haal IP-adres op (meerdere methodes proberen) - FIX: || null toegevoegd
  const ip: IPAddress | null = 
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.ip ||
    null; // FIX: Expliciete null fallback

  // Toegestane IP-adressen (makkelijk uit te breiden)
  const allowedIPs: IPAddress[] = [
  '127.0.0.1', // Localhost
  '::1',       // IPv6 Localhost
  '2a02:a46e:549e:0:e4c4:26b3:e601:6782', // Jouw IPv6
  '84.86.144.131', // Jouw IPv4
  // ...andere IP's
];

  // Ook environment variable ondersteuning behouden (optioneel)
  if (process.env.ALLOWED_IPS) {
    const envIPs = process.env.ALLOWED_IPS.split(',').map(ip => ip.trim());
    allowedIPs.push(...envIPs);
  }

  // Log voor debugging (handig voor testen)
  console.log(`🔍 Request from IP: ${ip} to ${pathname}`);
  console.log(`📋 Allowed IPs: ${allowedIPs.join(', ')}`);

  if (!ip) {
    console.warn('❌ Could not determine client IP');
    return new NextResponse(JSON.stringify({ 
      error: 'Access denied',
      message: 'Unable to verify your IP address',
      timestamp: new Date().toISOString()
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check of IP is toegestaan
  const isAllowed = allowedIPs.some(allowedIP => {
    // Exacte match
    if (ip === allowedIP) return true;
    
    // IPv6 adressen kunnen gecomprimeerd zijn, dus ook varianten checken
    if (ip.includes(':') && allowedIP.includes(':')) {
      // Simpele IPv6 normalisatie
      const normalizeIPv6 = (addr: string) => addr.toLowerCase().replace(/^::ffff:/, '');
      return normalizeIPv6(ip) === normalizeIPv6(allowedIP);
    }
    
    return false;
  });

  if (!isAllowed) {
    console.warn(`🚫 Unauthorized access attempt from IP: ${ip}`);
    return new NextResponse(JSON.stringify({ 
      error: 'IP restriction hahaha >> rIP ;)',
      message: 'Your IP is not authorized to access this resource',
      ip: ip,
      timestamp: new Date().toISOString()
    }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log(`✅ Access granted for IP: ${ip}`);
  return NextResponse.next();
}