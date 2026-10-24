import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

interface DrawerBody {
  printerName?: string;
}

export default async function drawerRoutes(fastify: FastifyInstance) {
  fastify.post('/api/open-drawer', async (request: FastifyRequest<{ Body: DrawerBody }>, reply: FastifyReply) => {
    try {
      const targetPrinter = String(request.body?.printerName || 'POS-80').trim();

      // SECURITY (2026-10-25): the printer name goes into a Windows command run on the
      // SERVER. Before, any text was accepted, so a fake "printer name" could run any
      // command on the server. Only normal printer names are allowed now: letters,
      // digits, spaces and - _ . ( ) #, at most 64 characters.
      if (!/^[A-Za-z0-9 _.()#-]{1,64}$/.test(targetPrinter)) {
        return reply.status(400).send({ success: false, error: 'Invalid printer name.' });
      }

      // ESC/POS drawer kick code bytes: 27, 112, 0, 25, 250
      const psCommand = `powershell -Command "[byte[]]$kick = 27,112,0,25,250; Out-Printer -InputObject $kick -Name '${targetPrinter}'"`;

      await execPromise(psCommand);

      return reply.send({ success: true, message: 'Drawer kick signal sent' });
    } catch (error: any) {
      fastify.log.error('Failed to kick cash drawer:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Failed to trigger cash drawer',
        details: error?.message || String(error)
      });
    }
  });
}