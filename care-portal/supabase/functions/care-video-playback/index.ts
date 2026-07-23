import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getR2Config, isR2Path, presignR2Get, toR2Key } from '../_shared/r2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeTier(tier: string | null | undefined): string {
  const t = String(tier || 'E').toUpperCase();
  if (t === 'A' || t === 'B' || t === 'C' || t === 'D' || t === 'E') return t;
  if (t === 'P10') return 'A';
  if (t === 'P20') return 'B';
  if (t === 'P30') return 'E';
  return 'E';
}

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

    const body = (await req.json()) as {
      session_token?: string;
      video_id?: string;
      video_kind?: 'room' | 'greeting';
    };
    const sessionToken = body.session_token?.trim();
    const videoId = body.video_id?.trim();
    const videoKind = body.video_kind === 'greeting' ? 'greeting' : 'room';
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

    const { data: room } = await admin
      .from('care_member_rooms')
      .select('id, program_tier, is_active')
      .eq('id', sess.room_id)
      .maybeSingle();

    if (!room || room.is_active === false) {
      return json({ error: 'room inactive' }, 401);
    }

    const memberTier = normalizeTier(room.program_tier as string | undefined);

    let storagePath: string | null = null;
    let itemKey: string | null = null;

    if (videoKind === 'greeting') {
      // 個人②を優先、なければマスター①
      const { data: override } = await admin
        .from('care_room_greeting_overrides')
        .select('id, slot_code, storage_path, is_published, room_id')
        .eq('id', videoId)
        .maybeSingle();

      if (override) {
        if (override.room_id !== sess.room_id || !override.is_published || !override.storage_path) {
          return json({ error: 'video not found' }, 404);
        }
        storagePath = override.storage_path;
        itemKey = `greeting_${override.slot_code}`;
      } else {
        const { data: greeting, error: greetErr } = await admin
          .from('care_greeting_videos')
          .select('id, slot_code, storage_path, is_published')
          .eq('id', videoId)
          .maybeSingle();

        if (greetErr || !greeting || !greeting.is_published || !greeting.storage_path) {
          return json({ error: 'video not found' }, 404);
        }
        storagePath = greeting.storage_path;
        itemKey = `greeting_${greeting.slot_code}`;
      }
    } else {
      const { data: video, error: vidErr } = await admin
        .from('care_room_videos')
        .select('id, room_id, storage_path, is_published, sub_room_slot')
        .eq('id', videoId)
        .maybeSingle();

      if (vidErr || !video || !video.is_published) {
        return json({ error: 'video not found' }, 404);
      }
      if (video.room_id !== sess.room_id) {
        return json({ error: 'forbidden' }, 403);
      }
      storagePath = video.storage_path;
      if (video.sub_room_slot != null) {
        itemKey = `sub_${video.sub_room_slot}`;
      }
    }

    if (itemKey) {
      const { data: rule } = await admin
        .from('care_program_item_rules')
        .select('allowed_tiers, min_tier')
        .eq('item_key', itemKey)
        .maybeSingle();

      if (rule) {
        const allowed = Array.isArray(rule.allowed_tiers)
          ? (rule.allowed_tiers as string[]).map((t) => String(t).toUpperCase())
          : null;
        if (allowed && allowed.length > 0 && !allowed.includes(memberTier)) {
          return json({ error: 'このプログラムでは再生できません' }, 403);
        }
      }
    }

    if (isR2Path(storagePath!)) {
      const r2 = getR2Config();
      if (!r2) {
        return json({ error: 'R2 が未設定のためこの動画を再生できません' }, 500);
      }
      const signedUrl = await presignR2Get(r2, toR2Key(storagePath!), 3600);
      return json({ signed_url: signedUrl }, 200);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from('care-videos')
      .createSignedUrl(storagePath!, 3600);

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
