import { FastifyInstance } from 'fastify';
import '@fastify/multipart'; // 👈 This registers .files() and .file() onto the FastifyRequest type
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

// Only pictures can be uploaded (V1 security item, 2026-10-25): JPG, PNG, WEBP, GIF.
// SVG is refused on purpose (it can contain scripts). Size limit: see app.ts (10 MB).
const PICTURE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
};

export default async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post('/api/upload', async (request, reply) => {
    // Acquire uploaded files stream
    const parts = request.files();
    const urls: string[] = [];

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    for await (const part of parts) {
      if (part.file) {
        // Picture type AND matching extension, otherwise the whole upload is refused.
        const ext = path.extname(part.filename || '').toLowerCase();
        const allowed = PICTURE_TYPES[String(part.mimetype || '').toLowerCase()];
        if (!allowed || !allowed.includes(ext)) {
          part.file.resume(); // throw the file away
          return reply.status(400).send({ message: 'Only pictures can be uploaded: JPG, PNG, WEBP or GIF.' });
        }
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const saveTo = path.join(uploadDir, uniqueFilename);

        // Save file to disk
        await pipeline(part.file, fs.createWriteStream(saveTo));
        // Bigger than the limit: the file was cut → remove it and refuse.
        if ((part.file as any).truncated) {
          fs.rmSync(saveTo, { force: true });
          return reply.status(400).send({ message: 'The picture is too big (10 MB maximum).' });
        }

        // The picture's address WITHOUT the machine's name (cloud-ready, 2026-10-26):
        // "/uploads/x.png" works on the dev PC, the VPS, behind IIS or a domain.
        // (Before, it stored http://127.0.0.1:3000/uploads/… — broken on any other machine.)
        const fileUrl = `/uploads/${uniqueFilename}`;
        urls.push(fileUrl);
      }
    }

    if (urls.length === 0) {
      return reply.status(400).send({ message: 'No files were uploaded.' });
    }

    return reply.send({ urls });
  });
}