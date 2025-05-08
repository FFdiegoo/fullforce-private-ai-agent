import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Laat login pagina's door zonder IP-check
  if (pathname.startsWith('/login') || pathname.startsWith('/public')) {
    return NextResponse.next()
  }

  const ip = req.ip || req.headers.get('x-forwarded-for')
  const allowedIPs = ['123.45.67.89', '10.0.0.0/16'] // Pas deze aan naar echte IPs

  if (!ip || !allowedIPs.includes(ip)) {
    return new NextResponse('Access Denied', { status: 403 })
  }

  return NextResponse.next()
}
