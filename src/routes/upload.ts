import { FastifyInstance } from 'fastify';
import '@fastify/multipart'; // 👈 This registers .files() and .file() onto the FastifyRequest type
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';

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
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(part.filename)}`;
        const saveTo = path.join(uploadDir, uniqueFilename);

        // Save file to disk
        await pipeline(part.file, fs.createWriteStream(saveTo));

        // Construct accessible image URL
        const fileUrl = `${request.protocol}://${request.host}/uploads/${uniqueFilename}`;
        urls.push(fileUrl);
      }
    }

    if (urls.length === 0) {
      return reply.status(400).send({ message: 'No files were uploaded.' });
    }

    return reply.send({ urls });
  });
}