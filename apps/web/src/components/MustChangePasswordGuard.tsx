'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import type { MeUser } from '@/lib/types';
import { useEffect } from 'react';

const ALLOWED = ['/account/security', '/change-password'];

export function MustChangePasswordGuard({ user }: { user: MeUser | null }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user?.mustChangePassword) return;
    if (ALLOWED.some((p) => pathname.startsWith(p))) return;
    router.replace('/change-password');
  }, [user, pathname, router]);

  return null;
}
