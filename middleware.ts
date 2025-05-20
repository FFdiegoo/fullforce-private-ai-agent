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

  if (isDevelopment) {
    return NextResponse.next();
  }

  // Skip all checks if ALLOWED_IPS is not set
  if (!process.env.ALLOWED_IPS) {
    return NextResponse.next()
  }

  const { pathname } = req.nextUrl

  // Public routes that bypass IP check
  const publicRoutes = ['/login', '/api/health']
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next()
  }

  const ip: IPAddress | null = req.ip || 
    req.headers.get('x-forwarded-for')?.split(',')[0] || 
    req.headers.get('x-real-ip')

  const allowedIPs: IPAddress[] = process.env.ALLOWED_IPS.split(',')

  if (!ip || !allowedIPs.includes(ip)) {
    console.warn(`Unauthorized access attempt from IP: ${ip}`)
    return new NextResponse(JSON.stringify({ 
      error: 'ninjaaaa',
      message: 'Your IP is not authorized to access this resource'
    }), { 
      status: 403,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  return NextResponse.next()
}