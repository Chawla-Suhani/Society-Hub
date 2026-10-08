import { route } from '@/lib/http';
import { buildMe } from '@/lib/session';

export const GET = route({ access: 'user' }, async ({ user }) => ({ user: await buildMe(user) }));
