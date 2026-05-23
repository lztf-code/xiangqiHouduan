import {
  GameType, RoomType, RoomStatus, User, UserRole,
  ChallengeRequest, DanmakuMessage, RoomFullInfo,
} from './types.js';

// --- Inline game logic (no file dependency) ---

// Chinese chess
type CBoard = (any | null)[][];
function createChineseBoard(): CBoard {
  const b: CBoard = Array.from({ length: 10 }, () => Array(9).fill(null));
  const back = ['rook', 'horse', 'elephant', 'advisor', 'king', 'advisor', 'elephant', 'horse', 'rook'];
  for (let c = 0; c < 9; c++) {
    b[0][c] = { type: back[c], color: 'black' };
    b[9][c] = { type: back[c], color: 'red' };
  }
  b[2][1] = { type: 'cannon', color: 'black' }; b[2][7] = { type: 'cannon', color: 'black' };
  b[7][1] = { type: 'cannon', color: 'red' }; b[7][7] = { type: 'cannon', color: 'red' };
  for (let c = 0; c < 9; c += 2) { b[3][c] = { type: 'pawn', color: 'black' }; }
  for (let c = 0; c < 9; c += 2) { b[6][c] = { type: 'pawn', color: 'red' }; }
  return b;
}
function cloneB(b: CBoard): CBoard { return b.map(r => r.map((p: any) => p ? { ...p } : null)); }

// International chess
type IBoard = (any | null)[][];
function createInternationalBoard(): IBoard {
  const b: IBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: 'black', hasMoved: false };
    b[1][c] = { type: 'pawn', color: 'black', hasMoved: false };
    b[6][c] = { type: 'pawn', color: 'white', hasMoved: false };
    b[7][c] = { type: back[c], color: 'white', hasMoved: false };
  }
  return b;
}

let idCounter = 0;
function genId(): string { return Date.now().toString(36) + (++idCounter).toString(36); }

function isKingInCheckInternational(board: IBoard, color: 'white' | 'black'): boolean {
  let kingRow = -1, kingCol = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p?.type === 'king' && p.color === color) {
        kingRow = r;
        kingCol = c;
        break;
      }
    }
    if (kingRow !== -1) break;
  }
  if (kingRow === -1) return true;

  const opponentColor = color === 'white' ? 'black' : 'white';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === opponentColor) {
        const dr = kingRow - r;
        const dc = kingCol - c;
        let valid = false;
        switch (p.type) {
          case 'king': valid = Math.abs(dr) + Math.abs(dc) === 1; break;
          case 'queen': valid = (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) && !isBlockedBishopRook(board, r, c, kingRow, kingCol); break;
          case 'rook': valid = (dr === 0 || dc === 0) && !isBlockedRook(board, r, c, kingRow, kingCol); break;
          case 'bishop': valid = Math.abs(dr) === Math.abs(dc) && !isBlockedBishop(board, r, c, kingRow, kingCol); break;
          case 'knight': valid = (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2); break;
          case 'pawn': {
            const pawnDir = p.color === 'white' ? -1 : 1;
            valid = dr === pawnDir && Math.abs(dc) === 1;
            break;
          }
        }
        if (valid) return true;
      }
    }
  }
  return false;
}

function isBlockedRook(board: IBoard, r1: number, c1: number, r2: number, c2: number): boolean {
  if (r1 !== r2 && c1 !== c2) return true;
  const dr = r1 === r2 ? 0 : (r2 > r1 ? 1 : -1);
  const dc = c1 === c2 ? 0 : (c2 > c1 ? 1 : -1);
  let r = r1 + dr, c = c1 + dc;
  while (r !== r2 || c !== c2) {
    if (board[r][c]) return true;
    r += dr; c += dc;
  }
  return false;
}

function isBlockedBishop(board: IBoard, r1: number, c1: number, r2: number, c2: number): boolean {
  const dr = r2 > r1 ? 1 : -1;
  const dc = c2 > c1 ? 1 : -1;
  let r = r1 + dr, c = c1 + dc;
  while (r !== r2 && c !== c2) {
    if (board[r][c]) return true;
    r += dr; c += dc;
  }
  return false;
}

function isBlockedBishopRook(board: IBoard, r1: number, c1: number, r2: number, c2: number): boolean {
  if (r1 === r2) return isBlockedRook(board, r1, c1, r2, c2);
  if (c1 === c2) return isBlockedRook(board, r1, c1, r2, c2);
  return isBlockedBishop(board, r1, c1, r2, c2);
}

function kingsFacingChinese(board: CBoard): boolean {
  let redKing: [number, number] | null = null;
  let blackKing: [number, number] | null = null;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p?.type === 'king') {
        if (p.color === 'red') redKing = [r, c];
        else blackKing = [r, c];
      }
    }
  }
  if (!redKing || !blackKing) return false;
  if (redKing[1] !== blackKing[1]) return false;
  const minR = Math.min(redKing[0], blackKing[0]);
  const maxR = Math.max(redKing[0], blackKing[0]);
  for (let r = minR + 1; r < maxR; r++) {
    if (board[r][redKing[1]]) return false;
  }
  return true;
}

function isInCheckChinese(board: CBoard, color: 'red' | 'black'): boolean {
  let kingRow = -1, kingCol = -1;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p?.type === 'king' && p.color === color) {
        kingRow = r;
        kingCol = c;
        break;
      }
    }
    if (kingRow !== -1) break;
  }
  if (kingRow === -1) return true;

  const opponentColor = color === 'red' ? 'black' : 'red';
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.color === opponentColor) {
        const dr = kingRow - r;
        const dc = kingCol - c;
        let valid = false;
        switch (p.type) {
          case 'king': valid = Math.abs(dr) + Math.abs(dc) === 1; break;
          case 'rook': {
            if (dr === 0 || dc === 0) {
              let blocked = false;
              const minR = Math.min(r, kingRow), maxR = Math.max(r, kingRow);
              const minC = Math.min(c, kingCol), maxC = Math.max(c, kingCol);
              for (let rr = minR + 1; rr < maxR; rr++) {
                for (let cc = minC + 1; cc < maxC; cc++) {
                  if (board[rr][cc]) blocked = true;
                }
              }
              valid = !blocked && (dr === 0 || dc === 0);
            }
            break;
          }
          case 'horse': valid = (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2); break;
          case 'elephant': valid = Math.abs(dr) === 2 && Math.abs(dc) === 2; break;
          case 'advisor': valid = Math.abs(dr) === 1 && Math.abs(dc) === 1; break;
          case 'cannon': {
            if (dr === 0 || dc === 0) {
              let count = 0;
              const minR = Math.min(r, kingRow), maxR = Math.max(r, kingRow);
              const minC = Math.min(c, kingCol), maxC = Math.max(c, kingCol);
              for (let rr = minR + 1; rr < maxR; rr++) {
                for (let cc = minC + 1; cc < maxC; cc++) {
                  if (board[rr][cc]) count++;
                }
              }
              valid = count === 1;
            }
            break;
          }
          case 'pawn': {
            if (Math.abs(dr) + Math.abs(dc) !== 1) break;
            if (p.color === 'red') {
              valid = dr < 0 && (kingRow >= 5 || dc === 0);
            } else {
              valid = dr > 0 && (kingRow <= 4 || dc === 0);
            }
            break;
          }
        }
        if (valid) return true;
      }
    }
  }
  return false;
}

export class GameRoom {
  id: string;
  name: string;
  type: RoomType;
  password: string;
  gameType: GameType;
  status: RoomStatus = 'waiting';

  owner: User;
  admins: User[] = [];
  redPlayer: User | null = null;
  blackPlayer: User | null = null;
  spectators: User[] = [];

  challengeQueue: ChallengeRequest[] = [];
  danmakuHistory: DanmakuMessage[] = [];
  moveHistory: string[] = [];

  board: any;
  currentTurn: string = '';

  constructor(name: string, type: RoomType, password: string, gameType: GameType, owner: User) {
    this.id = genId();
    this.name = name;
    this.type = type;
    this.password = password;
    this.gameType = gameType;
    this.owner = owner;
    this.resetGame();
  }

  resetGame() {
    if (this.gameType === 'chinese') {
      this.board = createChineseBoard();
      this.currentTurn = 'red';
    } else {
      this.board = createInternationalBoard();
      this.currentTurn = 'white';
    }
    this.status = 'waiting';
    this.moveHistory = [];
  }

  getUserRole(userId: string): UserRole | null {
    if (this.owner.id === userId) return 'owner';
    if (this.admins.find(a => a.id === userId)) return 'admin';
    if (this.redPlayer?.id === userId || this.blackPlayer?.id === userId) return 'player';
    if (this.spectators.find(s => s.id === userId)) return 'spectator';
    return null;
  }

  isManager(userId: string): boolean {
    const role = this.getUserRole(userId);
    return role === 'owner' || role === 'admin';
  }

  getUserById(userId: string): User | undefined {
    if (this.owner.id === userId) return this.owner;
    const admin = this.admins.find(a => a.id === userId);
    if (admin) return admin;
    if (this.redPlayer?.id === userId) return this.redPlayer;
    if (this.blackPlayer?.id === userId) return this.blackPlayer;
    return this.spectators.find(s => s.id === userId);
  }

  getAllUsers(): User[] {
    const users: User[] = [this.owner, ...this.admins];
    if (this.redPlayer) users.push(this.redPlayer);
    if (this.blackPlayer) users.push(this.blackPlayer);
    users.push(...this.spectators);
    return users;
  }

  addSpectator(user: User) {
    if (!this.spectators.find(s => s.id === user.id)) {
      this.spectators.push({ ...user, role: 'spectator' });
    }
  }

  removeUser(userId: string) {
    this.admins = this.admins.filter(a => a.id !== userId);
    this.spectators = this.spectators.filter(s => s.id !== userId);
    this.challengeQueue = this.challengeQueue.filter(c => c.userId !== userId);

    if (this.redPlayer?.id === userId) this.redPlayer = null;
    if (this.blackPlayer?.id === userId) this.blackPlayer = null;
  }

  chooseSide(userId: string, side: 'red' | 'black') {
    const user = this.getUserById(userId);
    if (!user) return false;
    if (side === 'red' && !this.redPlayer) {
      this.spectators = this.spectators.filter(s => s.id !== userId);
      this.admins = this.admins.filter(a => a.id !== userId);
      this.redPlayer = { ...user, role: 'player' };
      return true;
    }
    if (side === 'black' && !this.blackPlayer) {
      this.spectators = this.spectators.filter(s => s.id !== userId);
      this.admins = this.admins.filter(a => a.id !== userId);
      this.blackPlayer = { ...user, role: 'player' };
      return true;
    }
    return false;
  }

  setAdmin(userId: string, isAdmin: boolean, byUserId: string) {
    if (!this.isManager(byUserId) || userId === this.owner.id) return false;
    if (isAdmin) {
      const user = this.spectators.find(s => s.id === userId);
      if (user) {
        this.spectators = this.spectators.filter(s => s.id !== userId);
        this.admins.push({ ...user, role: 'admin' });
        return true;
      }
    } else {
      const admin = this.admins.find(a => a.id === userId);
      if (admin) {
        this.admins = this.admins.filter(a => a.id !== userId);
        this.spectators.push({ ...admin, role: 'spectator' });
        return true;
      }
    }
    return false;
  }

  kickUser(userId: string, byUserId: string): User | null {
    if (!this.isManager(byUserId) || userId === this.owner.id) return null;
    const user = this.getUserById(userId);
    if (!user) return null;
    this.removeUser(userId);
    return user;
  }

  addChallenge(userId: string): boolean {
    if (this.getUserRole(userId) !== 'spectator') return false;
    if (this.challengeQueue.find(c => c.userId === userId)) return false;
    const user = this.getUserById(userId);
    if (!user) return false;
    this.challengeQueue.push({
      id: genId(),
      userId,
      nickname: user.nickname,
      timestamp: Date.now(),
    });
    return true;
  }

  cancelChallenge(userId: string) {
    this.challengeQueue = this.challengeQueue.filter(c => c.userId !== userId);
  }

  respondChallenge(requestId: string, accept: boolean): ChallengeRequest | null {
    const req = this.challengeQueue.find(c => c.id === requestId);
    if (!req) return null;
    this.challengeQueue = this.challengeQueue.filter(c => c.id !== requestId);
    if (accept) return req;
    return null;
  }

  addDanmaku(userId: string, content: string): DanmakuMessage | null {
    const user = this.getUserById(userId);
    if (!user || content.trim().length === 0 || content.length > 100) return null;
    const msg: DanmakuMessage = {
      id: genId(),
      userId,
      nickname: user.nickname,
      content: content.trim(),
      timestamp: Date.now(),
    };
    this.danmakuHistory.push(msg);
    if (this.danmakuHistory.length > 200) this.danmakuHistory.shift();
    return msg;
  }

  makeMove(userId: string, move: any): { valid: boolean; board?: any; currentTurn?: string; moveStr?: string; gameOver?: boolean; winner?: string } {
    if (this.status !== 'playing') return { valid: false };
    const isPlayer = (this.gameType === 'chinese')
      ? (this.currentTurn === 'red' && this.redPlayer?.id === userId) ||
      (this.currentTurn === 'black' && this.blackPlayer?.id === userId)
      : (this.currentTurn === 'white' && this.redPlayer?.id === userId) ||
      (this.currentTurn === 'black' && this.blackPlayer?.id === userId);
    if (!isPlayer) return { valid: false };

    const piece = this.board[move.fromRow]?.[move.fromCol];
    if (!piece) return { valid: false };

    const newBoard = cloneB(this.board);
    newBoard[move.toRow][move.toCol] = { ...piece, hasMoved: true };
    newBoard[move.fromRow][move.fromCol] = null;

    if (move.isEnPassant) newBoard[move.fromRow][move.toCol] = null;
    if (move.isCastleKing) {
      newBoard[move.fromRow][5] = newBoard[move.fromRow][7];
      newBoard[move.fromRow][7] = null;
      if (newBoard[move.fromRow][5]) newBoard[move.fromRow][5].hasMoved = true;
    }
    if (move.isCastleQueen) {
      newBoard[move.fromRow][3] = newBoard[move.fromRow][0];
      newBoard[move.fromRow][0] = null;
      if (newBoard[move.fromRow][3]) newBoard[move.fromRow][3].hasMoved = true;
    }
    if (move.promotion) {
      newBoard[move.toRow][move.toCol] = { type: move.promotion, color: piece.color, hasMoved: true };
    }

    if (this.gameType === 'chinese') {
      if (kingsFacingChinese(newBoard)) return { valid: false };
      if (isInCheckChinese(newBoard, piece.color)) return { valid: false };
    } else {
      if (isKingInCheckInternational(newBoard, piece.color as 'white' | 'black')) return { valid: false };
    }

    this.board = newBoard;
    const moveStr = `${piece.type !== 'pawn' ? piece.type[0].toUpperCase() : ''}${String.fromCharCode(97 + move.fromCol)}${this.gameType === 'chinese' ? 10 - move.fromRow : 8 - move.fromRow}-${String.fromCharCode(97 + move.toCol)}${this.gameType === 'chinese' ? 10 - move.toRow : 8 - move.toRow}`;
    this.moveHistory.push(moveStr);

    if (this.gameType === 'chinese') {
      this.currentTurn = this.currentTurn === 'red' ? 'black' : 'red';
    } else {
      this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
    }

    return { valid: true, board: this.board, currentTurn: this.currentTurn, moveStr };
  }

  checkStartGame() {
    if (this.redPlayer && this.blackPlayer && this.status === 'waiting') {
      this.status = 'playing';
      return true;
    }
    return false;
  }

  startNextChallenger(winnerSide?: string): { user: User; side: 'red' | 'black' } | null {
    // After game finishes, winner stays, loser replaced by next challenger
    if (this.challengeQueue.length === 0) {
      this.status = 'waiting';
      return null;
    }
    const next = this.challengeQueue.shift()!;
    const user = this.getUserById(next.userId);
    if (!user) return this.startNextChallenger(winnerSide);

    // Determine which side to replace (the loser's side)
    let replaceSide: 'red' | 'black' = 'black'; // default
    if (winnerSide === 'red' || winnerSide === 'white') {
      replaceSide = 'black'; // red/white won, replace black
    } else if (winnerSide === 'black') {
      replaceSide = 'red'; // black won, replace red
    }

    // Move the loser to spectators
    const loser = replaceSide === 'red' ? this.redPlayer : this.blackPlayer;
    if (loser) {
      this.spectators.push({ ...loser, role: 'spectator' });
    }

    // Place challenger on the loser's side
    this.spectators = this.spectators.filter(s => s.id !== user.id);
    if (replaceSide === 'red') {
      this.redPlayer = { ...user, role: 'player' };
    } else {
      this.blackPlayer = { ...user, role: 'player' };
    }
    this.resetGame();
    this.status = 'playing';
    return { user, side: replaceSide };
  }

  toRoomInfo(): import('./types.js').RoomInfo {
    let playerCount = 0;
    if (this.redPlayer) playerCount++;
    if (this.blackPlayer) playerCount++;
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      hasPassword: !!this.password,
      gameType: this.gameType,
      ownerName: this.owner.nickname,
      playerCount,
      spectatorCount: this.spectators.length + this.admins.length,
      status: this.status,
    };
  }

  toRoomFullInfo(): RoomFullInfo {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      hasPassword: !!this.password,
      gameType: this.gameType,
      owner: this.owner,
      admins: [...this.admins],
      redPlayer: this.redPlayer,
      blackPlayer: this.blackPlayer,
      spectators: [...this.spectators],
      challengeQueue: [...this.challengeQueue],
      status: this.status,
      currentTurn: this.currentTurn,
      moveHistory: [...this.moveHistory],
    };
  }
}
