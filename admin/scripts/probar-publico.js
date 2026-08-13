import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv({ path: path.resolve(__dirname, '../../.env') });

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const data = readFileSync(path.resolve(__dirname, '../../assets/logoheader.jpeg'));
await client.send(new PutObjectCommand({
  Bucket: process.env.R2_BUCKET,
  Key: 'productos/logoheader.jpeg',
  Body: data,
  ContentType: 'image/jpeg',
  CacheControl: 'public, max-age=86400',
}));
console.log('Logo subido al bucket ✓');
