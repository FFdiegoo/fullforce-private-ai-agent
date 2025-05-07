import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for')
  const allowedIPs = ['123.45.67.89', '10.0.0.0/16'] // VPN of bedrijfsnetwerk

  if (!ip || !allowedIPs.includes(ip)) {
    return new NextResponse('Access Denied', { status: 403 })
  }

  return NextResponse.next()
}

