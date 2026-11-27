import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import User from '../modules/users/user.model';

let io: Server;

const extractSocketToken = (socket: Socket, payload?: any): string | null => {
  if (payload && typeof payload === 'object' && typeof payload.token === 'string' && payload.token.trim()) {
    return payload.token.replace(/^Bearer\s+/i, '').trim();
  }
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }
  const authHeader = socket.handshake.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
};

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // Admins can join this room only after verifying a valid Admin/Sub-Admin JWT
    socket.on('join_admin_room', async (payload?: any) => {
      try {
        const token = extractSocketToken(socket, payload);
        const jwtSecret = process.env.JWT_SECRET;
        if (!token || !jwtSecret) {
          console.warn(`[Socket.io Security] Rejected unauthenticated join_admin_room from ${socket.id}`);
          socket.emit('admin_room_error', { message: 'Authentication required to join admin room.' });
          return;
        }

        const decoded: any = jwt.verify(token, jwtSecret);
        const user = await User.findById(decoded.id).select('roles').lean();

        const isAuthorizedAdmin =
          user &&
          Array.isArray(user.roles) &&
          (user.roles.includes('SUPER_ADMIN') || user.roles.includes('SUB_ADMIN'));

        if (!isAuthorizedAdmin) {
          console.warn(`[Socket.io Security] Forbidden join_admin_room attempt by user ${decoded?.id || 'unknown'} (${socket.id})`);
          socket.emit('admin_room_error', { message: 'Forbidden: Admin role required.' });
          return;
        }

        socket.join('admin_dashboard');
        console.log(`[Socket.io] Verified admin ${decoded.id} (${socket.id}) joined admin_dashboard`);
      } catch (err: any) {
        console.warn(`[Socket.io Security] Invalid token for join_admin_room (${socket.id}): ${err?.message || 'unknown error'}`);
        socket.emit('admin_room_error', { message: 'Invalid or expired authentication token.' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIo = () => {
  if (!io) {
    console.warn('Socket.io not initialized yet!');
    return null;
  }
  return io;
};
