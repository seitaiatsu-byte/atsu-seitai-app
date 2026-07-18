import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'server misconfigured' }, 500);
    }

    const body = (await req.json()) as { session_token?: string; item_id?: string };
    const sessionToken = body.session_token?.trim();
    const itemId = body.item_id?.trim();
    if (!sessionToken || !itemId) {
      return json({ error: 'session_token and item_id are required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: sess, error: sessErr } = await admin
      .from('care_room_sessions')
      .select('id, expires_at')
      .eq('id', sessionToken)
      .maybeSingle();

    if (sessErr || !sess) {
      return json({ error: 'invalid session' }, 401);
    }
    if (new Date(sess.expires_at).getTime() <= Date.now()) {
      return json({ error: 'session expired' }, 401);
    }

    const { data: item, error: itemErr } = await admin
      .from('care_study_items')
      .select('id, item_type, storage_path, is_published')
      .eq('id', itemId)
      .maybeSingle();

    if (itemErr || !item || !item.is_published || !item.storage_path) {
      return json({ error: 'material not found' }, 404);
    }
    if (item.item_type !== 'image' && item.item_type !== 'pdf') {
      return json({ error: 'not a file material' }, 400);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from('care-materials')
      .createSignedUrl(item.storage_path, 3600);

    if (signErr || !signed?.signedUrl) {
      return json({ error: signErr?.message || 'signed url failed' }, 500);
    }

    return json({ signed_url: signed.signedUrl, item_type: item.item_type }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});

function json(payload: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
