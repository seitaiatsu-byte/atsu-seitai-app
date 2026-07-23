import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  deleteR2Object,
  getR2Config,
  isR2Path,
  presignR2Put,
  toR2Key,
  toR2StoragePath,
} from '../_shared/r2.ts';

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: 'server misconfigured' }, 500);
    }

    const cfg = getR2Config();
    if (!cfg) {
      return json({ error: 'r2_not_configured', message: 'Cloudflare R2 が未設定です' }, 503);
    }

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: staff, error: staffErr } = await userClient.rpc('care_is_staff');
    if (staffErr || !staff) {
      return json({ error: 'staff only' }, 403);
    }

    const body = (await req.json()) as {
      action?: 'presign' | 'delete';
      storage_path?: string;
      content_type?: string;
    };

    const action = body.action === 'delete' ? 'delete' : 'presign';
    const rawPath = (body.storage_path || '').trim().replace(/^\/+/, '');
    if (!rawPath || rawPath.includes('..')) {
      return json({ error: 'storage_path is required' }, 400);
    }

    if (action === 'delete') {
      if (isR2Path(rawPath)) {
        await deleteR2Object(cfg, toR2Key(rawPath));
      }
      return json({ ok: true }, 200);
    }

    const key = toR2Key(rawPath);
    const contentType = (body.content_type || 'video/mp4').trim() || 'video/mp4';
    const uploadUrl = await presignR2Put(cfg, key, contentType, 3600);

    return json(
      {
        upload_url: uploadUrl,
        storage_path: toR2StoragePath(key),
        content_type: contentType,
      },
      200
    );
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
