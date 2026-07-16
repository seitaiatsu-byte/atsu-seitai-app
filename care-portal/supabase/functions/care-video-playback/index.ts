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

    const body = (await req.json()) as { session_token?: string; video_id?: string };
    const sessionToken = body.session_token?.trim();
    const videoId = body.video_id?.trim();
    if (!sessionToken || !videoId) {
      return json({ error: 'session_token and video_id are required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: sess, error: sessErr } = await admin
      .from('care_room_sessions')
      .select('id, room_id, expires_at')
      .eq('id', sessionToken)
      .maybeSingle();

    if (sessErr || !sess) {
      return json({ error: 'invalid session' }, 401);
    }
    if (new Date(sess.expires_at).getTime() <= Date.now()) {
      return json({ error: 'session expired' }, 401);
    }

    const { data: video, error: vidErr } = await admin
      .from('care_room_videos')
      .select('id, room_id, storage_path, is_published')
      .eq('id', videoId)
      .maybeSingle();

    if (vidErr || !video || !video.is_published) {
      return json({ error: 'video not found' }, 404);
    }
    if (video.room_id !== sess.room_id) {
      return json({ error: 'forbidden' }, 403);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from('care-videos')
      .createSignedUrl(video.storage_path, 3600);

    if (signErr || !signed?.signedUrl) {
      return json({ error: signErr?.message || 'signed url failed' }, 500);
    }

    return json({ signed_url: signed.signedUrl }, 200);
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
