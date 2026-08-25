import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from 'npm:@supabase/server@^1';

const SITE_ORIGINS = new Set([
  'https://night-ops.training',
  'https://www.night-ops.training',
  'http://localhost:5173',
  'http://127.0.0.1:4173'
]);

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
  const origin = request.headers.get('origin') || '';
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (origin && !SITE_ORIGINS.has(origin)) return response({ error: 'Origin not allowed' }, 403);

  const userId = String(context.userClaims?.sub || '');
  if (!userId) return response({ error: 'Invalid session' }, 401);

  let body: { action?: string; targetId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return response({ error: 'Invalid request' }, 400);
  }

  const admin = context.supabaseAdmin;

  if (body.action === 'delete_self') {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return response({ error: 'Account could not be deleted' }, 500);
    return response({ ok: true });
  }

  if (body.action === 'set_role') {
    if (!body.targetId || !['member', 'lead'].includes(body.role || '')) {
      return response({ error: 'Invalid role request' }, 400);
    }

    const { data: requester } = await admin.from('profiles').select('role').eq('id', userId).single();
    if (requester?.role !== 'lead') return response({ error: 'Lead access required' }, 403);

    if (body.targetId === userId && body.role === 'member') {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lead');
      if ((count || 0) <= 1) return response({ error: 'The final lead cannot remove their own lead access' }, 409);
    }

    const { data, error } = await admin
      .from('profiles')
      .update({ role: body.role })
      .eq('id', body.targetId)
      .select('id,display_name,role')
      .single();
    if (error) return response({ error: 'Role could not be updated' }, 500);
    return response({ profile: data });
  }

  return response({ error: 'Unknown action' }, 400);
  })
};
