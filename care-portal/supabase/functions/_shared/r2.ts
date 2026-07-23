import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const R2_PREFIX = 'r2:';

export function isR2Path(storagePath: string): boolean {
  return storagePath.startsWith(R2_PREFIX);
}

export function toR2Key(storagePath: string): string {
  return isR2Path(storagePath) ? storagePath.slice(R2_PREFIX.length) : storagePath;
}

export function toR2StoragePath(key: string): string {
  return key.startsWith(R2_PREFIX) ? key : `${R2_PREFIX}${key}`;
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  client: AwsClient;
};

export function getR2Config(): R2Config | null {
  const accountId = (Deno.env.get('R2_ACCOUNT_ID') || '').trim();
  const accessKeyId = (Deno.env.get('R2_ACCESS_KEY_ID') || '').trim();
  const secretAccessKey = (Deno.env.get('R2_SECRET_ACCESS_KEY') || '').trim();
  const bucket = (Deno.env.get('R2_BUCKET_NAME') || 'care-videos').trim();
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto',
    }),
  };
}

export async function presignR2Put(
  cfg: R2Config,
  key: string,
  contentType: string,
  expiresSeconds = 3600
): Promise<string> {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const signed = await cfg.client.sign(
    new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
    }),
    { aws: { signQuery: true } }
  );
  return signed.url;
}

export async function presignR2Get(cfg: R2Config, key: string, expiresSeconds = 3600): Promise<string> {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  const signed = await cfg.client.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function deleteR2Object(cfg: R2Config, key: string): Promise<void> {
  const url = `${cfg.endpoint}/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const signed = await cfg.client.sign(new Request(url, { method: 'DELETE' }));
  const res = await fetch(signed);
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`R2 delete failed (${res.status}): ${text.slice(0, 200)}`);
  }
}
