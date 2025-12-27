
export enum GameState {
  HOME = 'HOME',
  ROOM_SELECTION = 'ROOM_SELECTION',
  ROOM_SETUP = 'ROOM_SETUP',
  AVATAR_PICKER = 'AVATAR_PICKER',
  LOBBY = 'LOBBY',
  ROUND_ANSWERING = 'ROUND_ANSWERING',
  ROUND_GUESSING = 'ROUND_GUESSING',
  SCORING = 'SCORING',
  FINAL_RESULTS = 'FINAL_RESULTS'
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  isHost?: boolean;
  presence_ref?: string;
}

export interface GameSettings {
  categoryId: string;
  rounds: number;
  timer: number;
}

export interface Question {
  id: string;
  text: string;
  category: string;
  targetPlayerId: string;
}

// Added missing Category interface exported for constants.tsx
export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
}
