import { FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';

interface ConnectedClient {
  socket: WebSocket;
  restaurantId: string;
}

class RoomManager {
  // Maps restaurantId -> Set of WebSockets
  private rooms: Map<string, Set<WebSocket>> = new Map();

  /**
   * Handles incoming WebSocket connection and sets up event listeners.
   */
  handleConnection(socket: WebSocket, req: FastifyRequest) {
    // 1. Optionally parse restaurantId from query string (e.g., /ws?restaurantId=123)
    const query = req.query as { restaurantId?: string };
    if (query?.restaurantId) {
      this.joinRoom(query.restaurantId, socket);
    }

    // 2. Handle incoming JSON messages from clients
    socket.on('message', (rawMessage: Buffer) => {
      try {
        const data = JSON.parse(rawMessage.toString());

        // Example message payload: { action: 'join', restaurantId: '123' }
        if (data.action === 'join' && data.restaurantId) {
          this.joinRoom(String(data.restaurantId), socket);
        }

        // Example message payload: { action: 'leave', restaurantId: '123' }
        if (data.action === 'leave' && data.restaurantId) {
          this.leaveRoom(String(data.restaurantId), socket);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    });

    // 3. Log errors
    socket.on('error', (err) => {
      console.error('WebSocket socket error:', err);
    });
  }

  // Add a socket to a restaurant room
  joinRoom(restaurantId: string, socket: WebSocket) {
    if (!this.rooms.has(restaurantId)) {
      this.rooms.set(restaurantId, new Set());
    }
    this.rooms.get(restaurantId)!.add(socket);

    // Clean up when the socket closes
    socket.on('close', () => {
      this.leaveRoom(restaurantId, socket);
    });
  }

  // Remove a socket from a restaurant room
  leaveRoom(restaurantId: string, socket: WebSocket) {
    const room = this.rooms.get(restaurantId);
    if (room) {
      room.delete(socket);
      if (room.size === 0) {
        this.rooms.delete(restaurantId);
      }
    }
  }

  // Emit an event to all clients in a specific restaurant room
  broadcastToRestaurant(restaurantId: string, event: string, payload: any) {
    const room = this.rooms.get(restaurantId);
    if (!room) return;

    const message = JSON.stringify({ event, payload });

    for (const socket of room) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    }
  }
}

export const roomManager = new RoomManager();