import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { roomManager } from './RoomManager.js';

const app = express();
app.use(cors());
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Broadcast room list to all in lobby
function broadcastRoomList() {
  io.emit('room-list', roomManager.getRoomList());
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // --- Set nickname ---
  socket.on('set-nickname', (nickname: string) => {
    const name = (nickname || '').trim().slice(0, 20) || '棋手';
    roomManager.setNickname(socket.id, name);
    // Send current room list after setting nickname
    socket.emit('room-list', roomManager.getRoomList());
  });

  // --- Create room ---
  socket.on('create-room', (data) => {
    if (roomManager.getRoomBySocketId(socket.id)) {
      socket.emit('error', '你已经在一个房间中');
      return;
    }
    const name = (data.name || '').trim().slice(0, 30) || '未命名房间';
    const room = roomManager.createRoom(socket.id, name, data.type, data.password || '', data.gameType);
    if (!room) {
      socket.emit('error', '创建房间失败');
      return;
    }
    socket.join(room.id);
    socket.emit('room-joined', room.toRoomFullInfo());
    socket.emit('game-state', { board: room.board, currentTurn: room.currentTurn });
    broadcastRoomList();
  });

  // --- Join room ---
  socket.on('join-room', (data) => {
    // If already in a room (e.g. creator navigating to room page), just re-send room info
    const existingRoom = roomManager.getRoomBySocketId(socket.id);
    if (existingRoom) {
      if (existingRoom.id === data.roomId) {
        // Already in this room, re-send state
        socket.emit('room-joined', existingRoom.toRoomFullInfo());
        socket.emit('game-state', { board: existingRoom.board, currentTurn: existingRoom.currentTurn });
        return;
      } else {
        socket.emit('error', '你已经在一个房间中');
        return;
      }
    }
    const result = roomManager.joinRoom(socket.id, data.roomId, data.password);
    if (!result) {
      socket.emit('error', '房间不存在');
      return;
    }
    if (result.error) {
      socket.emit('error', result.error);
      return;
    }
    const room = result.room;
    socket.join(room.id);
    socket.emit('room-joined', room.toRoomFullInfo());
    socket.emit('game-state', { board: room.board, currentTurn: room.currentTurn });
    socket.to(room.id).emit('user-joined', { id: socket.id, nickname: roomManager.getNickname(socket.id), role: 'spectator' });
    io.to(room.id).emit('room-update', room.toRoomFullInfo());
    broadcastRoomList();
  });

  // --- Leave room ---
  socket.on('leave-room', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    socket.leave(room.id);
    const leftRoom = roomManager.leaveRoom(socket.id);
    if (leftRoom) {
      io.to(leftRoom.id).emit('user-left', { id: socket.id, nickname: roomManager.getNickname(socket.id), role: 'spectator' });
      io.to(leftRoom.id).emit('room-update', leftRoom.toRoomFullInfo());
    }
    broadcastRoomList();
  });

  // --- Choose side ---
  socket.on('choose-side', (side: 'red' | 'black') => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    if (room.chooseSide(socket.id, side)) {
      const started = room.checkStartGame();
      io.to(room.id).emit('room-update', room.toRoomFullInfo());
      if (started) {
        io.to(room.id).emit('game-state', { board: room.board, currentTurn: room.currentTurn });
      }
      broadcastRoomList();
    }
  });

  // --- Make move ---
  socket.on('make-move', (move) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || room.status !== 'playing') return;
    const result = room.makeMove(socket.id, move);
    if (result.valid) {
      io.to(room.id).emit('move-made', {
        move,
        moveStr: result.moveStr || '',
        board: result.board,
        currentTurn: result.currentTurn,
      });
    }
  });

  // --- Game over (client declares checkmate/stalemate) ---
  socket.on('declare-game-over', (data: { winner: string; reason: string }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    // Allow both players and managers to declare game over
    const role = room.getUserRole(socket.id);
    if (role !== 'player' && role !== 'owner' && role !== 'admin') return;
    room.status = 'finished';
    io.to(room.id).emit('game-over', data);
    io.to(room.id).emit('room-update', room.toRoomFullInfo());
    broadcastRoomList();

    // Auto start next challenger if available
    if (room.challengeQueue.length > 0) {
      setTimeout(() => {
        const next = room.startNextChallenger(data.winner);
        if (next) {
          io.to(room.id).emit('room-update', room.toRoomFullInfo());
          io.to(room.id).emit('game-state', { board: room.board, currentTurn: room.currentTurn });
          broadcastRoomList();
        }
      }, 3000);
    }
  });

  // --- Restart game ---
  socket.on('restart-game', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || !room.isManager(socket.id)) return;
    // Move players back to spectators
    if (room.redPlayer) {
      room.spectators.push({ ...room.redPlayer, role: 'spectator' });
      room.redPlayer = null;
    }
    if (room.blackPlayer) {
      room.spectators.push({ ...room.blackPlayer, role: 'spectator' });
      room.blackPlayer = null;
    }
    room.resetGame();
    io.to(room.id).emit('room-update', room.toRoomFullInfo());
    io.to(room.id).emit('game-state', { board: room.board, currentTurn: room.currentTurn });
    broadcastRoomList();
  });

  // --- Danmaku ---
  socket.on('send-danmaku', (content: string) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const msg = room.addDanmaku(socket.id, content);
    if (msg) {
      io.to(room.id).emit('danmaku', msg);
    }
  });

  // --- Challenge ---
  socket.on('request-challenge', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    if (room.addChallenge(socket.id)) {
      io.to(room.id).emit('challenge-update', room.challengeQueue);
      io.to(room.id).emit('room-update', room.toRoomFullInfo());
    }
  });

  socket.on('cancel-challenge', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    room.cancelChallenge(socket.id);
    io.to(room.id).emit('challenge-update', room.challengeQueue);
    io.to(room.id).emit('room-update', room.toRoomFullInfo());
  });

  socket.on('respond-challenge', (data: { requestId: string; accept: boolean }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || !room.isManager(socket.id)) return;
    const accepted = room.respondChallenge(data.requestId, data.accept);
    if (data.accept && accepted) {
      // Accept: move challenger to black player side
      room.chooseSide(accepted.userId, 'black');
    }
    io.to(room.id).emit('challenge-update', room.challengeQueue);
    io.to(room.id).emit('room-update', room.toRoomFullInfo());
    const started = room.checkStartGame();
    if (started) {
      io.to(room.id).emit('game-state', { board: room.board, currentTurn: room.currentTurn });
    }
    broadcastRoomList();
  });

  // --- Room management ---
  socket.on('set-admin', (data: { userId: string; isAdmin: boolean }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    if (room.setAdmin(data.userId, data.isAdmin, socket.id)) {
      io.to(room.id).emit('room-update', room.toRoomFullInfo());
    }
  });

  socket.on('kick-user', (userId: string) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const kicked = room.kickUser(userId, socket.id);
    if (kicked) {
      const kickSocket = io.sockets.sockets.get(userId);
      if (kickSocket) {
        kickSocket.leave(room.id);
        kickSocket.emit('error', '你已被踢出房间');
        kickSocket.emit('room-kicked');
      }
      io.to(room.id).emit('room-update', room.toRoomFullInfo());
      broadcastRoomList();
    }
  });

  socket.on('toggle-room-type', (data: { type: 'public' | 'private'; password?: string }) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room || room.owner.id !== socket.id) return;
    room.type = data.type;
    room.password = data.password || '';
    io.to(room.id).emit('room-update', room.toRoomFullInfo());
    broadcastRoomList();
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const room = roomManager.getRoomBySocketId(socket.id);
    if (room) {
      const nickname = roomManager.getNickname(socket.id);
      socket.leave(room.id);
      const leftRoom = roomManager.leaveRoom(socket.id);
      if (leftRoom) {
        io.to(leftRoom.id).emit('user-left', { id: socket.id, nickname, role: 'spectator' });
        io.to(leftRoom.id).emit('room-update', leftRoom.toRoomFullInfo());
      }
      broadcastRoomList();
    }
    roomManager.removeUserFromAll(socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Chess server running on port ${PORT}`);
});
