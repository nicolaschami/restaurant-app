import { FastifyInstance } from 'fastify';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export default async function printerRoutes(fastify: FastifyInstance) {
  fastify.get('/api/printers', async (request, reply) => {
    try {
      // Windows PowerShell command to fetch installed printer names
      const command = 'powershell "Get-Printer | Select-Object -ExpandProperty Name"';
      const { stdout } = await execPromise(command);

      // Clean up PowerShell output string into a clean array
      const printerList = stdout
        .split('\r\n')
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      return reply.send({ printers: printerList });
    } catch (error) {
      console.error('Failed to get printers:', error);
      return reply.status(500).send({ printers: [], error: 'Could not fetch OS printers' });
    }
  });
}