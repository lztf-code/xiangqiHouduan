export type GameType = 'chinese' | 'international';
export type RoomType = 'public' | 'private';
export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type UserRole = 'owner' | 'admin' | 'player' | 'spectator';

export interface User {
  id: string;       // socketId
  nickname: string;
  role: UserRole;
}

export interface ChallengeRequest {
  id: string;
  userId: string;
  nickname: string;
  timestamp: number;
}

export interface DanmakuMessage {
  id: string;
  userId: string;
  nickname: string;
  content: string;
  timestamp: number;
}

export interface RoomInfo {
  id: string;
  name: string;
  type: RoomType;
  hasPassword: boolean;
  gameType: GameType;
  ownerName: string;
  playerCount: number;
  spectatorCount: number;
  status: RoomStatus;
}

export interface RoomFullInfo {
  id: string;
  name: string;
  type: RoomType;
  hasPassword: boolean;
  gameType: GameType;
  owner: User;
  admins: User[];
  redPlayer: User | null;
  blackPlayer: User | null;
  spectators: User[];
  challengeQueue: ChallengeRequest[];
  status: RoomStatus;
  currentTurn: string;
  moveHistory: string[];
}

// Socket event types
export interface ClientToServerEvents {
  'set-nickname': (nickname: string) => void;
  'create-room': (data: { name: string; type: RoomType; password?: string; gameType: GameType }) => void;
  'join-room': (data: { roomId: string; password?: string }) => void;
  'leave-room': () => void;
  'make-move': (move: any) => void;
  'send-danmaku': (content: string) => void;
  'request-challenge': () => void;
  'cancel-challenge': () => void;
  'respond-challenge': (data: { requestId: string; accept: boolean }) => void;
  'set-admin': (data: { userId: string; isAdmin: boolean }) => void;
  'kick-user': (userId: string) => void;
  'toggle-room-type': (data: { type: RoomType; password?: string }) => void;
  'restart-game': () => void;
  'choose-side': (side: 'red' | 'black') => void;
}

export interface ServerToClientEvents {
  'room-list': (rooms: RoomInfo[]) => void;
  'room-joined': (room: RoomFullInfo) => void;
  'room-update': (room: RoomFullInfo) => void;
  'game-state': (data: { board: any; currentTurn: string; lastMove?: any }) => void;
  'danmaku': (msg: DanmakuMessage) => void;
  'challenge-update': (queue: ChallengeRequest[]) => void;
  'error': (message: string) => void;
  'user-joined': (user: User) => void;
  'user-left': (user: User) => void;
  'game-over': (data: { winner: string; reason: string }) => void;
  'move-made': (data: { move: any; moveStr: string; board: any; currentTurn: string }) => void;
}
