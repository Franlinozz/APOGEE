import { NextRequest, NextResponse } from 'next/server';

const PROTECTED = [
  '/dashboard',
  '/agents',
  '/marketplace',
  '/memory',
  '/receipts',
  '/policies',
  '/apogee-pilot',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get('apogee-jwt')?.value;
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/connect';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/agents/:path*',
    '/marketplace/:path*',
    '/memory/:path*',
    '/receipts/:path*',
    '/policies/:path*',
    '/apogee-pilot/:path*',
  ],
};
