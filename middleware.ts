import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // /login publiek houden
  if (pathname === '/login') {
    return NextResponse.next()
  }

  // Alleen specifieke IP’s toestaan
  const ip = req.ip || req.headers.get('x-forwarded-for')
  const allowedIPs = ['123.45.67.89'] // vervang met je echte IP

  if (!ip || !allowedIPs.includes(ip)) {
    return new NextResponse('Access Denied', { status: 403 })
  }

  return NextResponse.next()
}