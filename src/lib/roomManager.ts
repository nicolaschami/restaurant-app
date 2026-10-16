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
  // `restaurantId` comes from the verified login token (see the /ws route in app.ts).
  // There is deliberately NO "join another room" message anymore: a screen could
  // otherwise ask to listen to a different restaurant's orders.
  handleConnection(socket: WebSocket, restaurantId: string) {
    // 1. Join the restaurant's room
    this.joinRoom(restaurantId, socket);

    // 2. Log errors
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