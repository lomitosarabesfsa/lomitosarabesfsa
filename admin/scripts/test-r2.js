import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv({ path: path.resolve(__dirname, '../../.env') });

import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET;
const key = 'test/conexion-ok.jpeg';

const list = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
console.log('Objetos actuales en el bucket:', (list.Contents || []).map(o => o.Key).join(', ') || '(vacío)');

const fs = await import('node:fs');
const data = fs.readFileSync(path.resolve(__dirname, '../../assets/logoheader.jpeg'));
await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: 'image/jpeg' }));
console.log('Imagen de prueba subida:', key, '(' + data.length + ' bytes)');

const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
const body = await got.Body.transformToByteArray();
console.log('Imagen leída de vuelta:', body.length, 'bytes — ' + (body.length === data.length ? 'MATCH ✓' : 'ERROR de integridad ✗'));

await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
console.log('Prueba eliminada. Conexión R2 FUNCIONANDO ✓');
