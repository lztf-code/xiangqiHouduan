import { GameRoom } from './GameRoom.js';
import { GameType, RoomType, RoomInfo, User } from './types.js';

export class RoomManager {
  rooms: Map<string, GameRoom> = new Map();
  userRooms: Map<string, string> = new Map(); // socketId -> roomId
  userNicknames: Map<string, string> = new Map(); // socketId -> nickname

  setNickname(socketId: string, nickname: string) {
    this.userNicknames.set(socketId, nickname);
  }

  getNickname(socketId: string): string {
    return this.userNicknames.get(socketId) || '匿名';
  }

  createRoom(socketId: string, name: string, type: RoomType, password: string, gameType: GameType): GameRoom | null {
    if (this.userRooms.has(socketId)) return null;
    const user: User = { id: socketId, nickname: this.getNickname(socketId), role: 'owner' };
    const room = new GameRoom(name, type, password, gameType, user);
    this.rooms.set(room.id, room);
    this.userRooms.set(socketId, room.id);
    return room;
  }

  joinRoom(socketId: string, roomId: string, password?: string): { room: GameRoom; error?: string } | null {
    if (this.userRooms.has(socketId)) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.type === 'private' && room.password && room.password !== password) {
      return { room, error: '密码错误' };
    }
    const user: User = { id: socketId, nickname: this.getNickname(socketId), role: 'spectator' };
    room.addSpectator(user);
    this.userRooms.set(socketId, roomId);
    return { room };
  }

  leaveRoom(socketId: string): GameRoom | null {
    const roomId = this.userRooms.get(socketId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.removeUser(socketId);
    this.userRooms.delete(socketId);

    // If owner left, transfer or destroy
    if (room.owner.id === socketId) {
      // Priority: admin > redPlayer > blackPlayer > spectator
      const newOwner = room.admins[0] || room.redPlayer || room.blackPlayer || room.spectators[0];
      if (newOwner) {
        // Remove from current role first
        room.removeUser(newOwner.id);
        // Set as new owner
        room.owner = { ...newOwner, role: 'owner' };
      } else {
        // No one left, destroy room
        this.rooms.delete(roomId);
        return room;
      }
    }

    return room;
  }

  getRoomBySocketId(socketId: string): GameRoom | null {
    const roomId = this.userRooms.get(socketId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  getRoomList(): RoomInfo[] {
    return Array.from(this.rooms.values())
      .filter(r => r.type === 'public')
      .map(r => r.toRoomInfo());
  }

  removeUserFromAll(socketId: string) {
    this.leaveRoom(socketId);
    this.userNicknames.delete(socketId);
  }
}

export const roomManager = new RoomManager();
