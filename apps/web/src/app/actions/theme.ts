'use server';

import { cookies } from 'next/headers';

export async function setTheme(theme: 'light' | 'dark'): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('apogee-theme', theme, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
