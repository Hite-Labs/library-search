import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';
import { randomUUID } from 'crypto';

let _r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _r2Client;
}

export function getR2Key(filename: string, mediaType: 'audio' | 'video' | 'pdf'): string {
  const prefix = mediaType === 'video' ? 'video' : mediaType === 'pdf' ? 'pdf' : 'audio';
  const ext = filename.split('.').pop() ?? '';
  return `${prefix}/${randomUUID()}.${ext}`;
}

export function getPublicUrl(r2Key: string): string {
  const base = env.R2_PUBLIC_URL_BASE.replace(/\/$/, '');
  return `${base}/${r2Key}`;
}

export async function getPresignedPutUrl(
  r2Key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: r2Key,
    ContentType: contentType,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: 3600 });
}
