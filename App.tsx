
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GameState, Player, Question, GameSettings } from './types';
import { CATEGORIES } from './constants';
import { geminiService } from './services/geminiService';
import { supabase } from './services/supabase';
import { audioService } from './services/audioService';
import { Button } from './components/Button';
import { Flashcard } from './components/Flashcard';
import { Clock, Users, RefreshCw, Sparkles, ChevronRight, Settings, Play, CheckCircle2, UserPlus } from 'lucide-react';

const App: React.FC = () => {
  // Game Context
  const [gameState, setGameState] = useState<GameState>(GameState.HOME);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [myId] = useState(Math.random().toString(36).substring(7));

  // Player State
  const [playerName, setPlayerName] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(Math.random().toString(36).substring(7));
  const avatarUrl = useMemo(() => `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`, [avatarSeed]);

  // Sync State
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<GameSettings>({ categoryId: 'alma', rounds: 5, timer: 45 });
  const [currentRound, setCurrentRound] = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [targetPlayer, setTargetPlayer] = useState<Player | null>(null);
  const [roundAnswers, setRoundAnswers] = useState<{ playerId: string, name: string, answer: string, avatar: string }[]>([]);
  const [revealedIdx, setRevealedIdx] = useState<number[]>([]);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});

  // Local UI State
  const [playerInput, setPlayerInput] = useState('');
  const [timer, setTimer] = useState(45);
  const [isLoading, setIsLoading] = useState(false);
  const channelRef = useRef<any>(null);

  // Real-time synchronization
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase.channel(`room_${roomCode}`, {
      config: { presence: { key: myId } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activePlayers = Object.values(state).flat() as any[];
        setPlayers(activePlayers.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          score: p.score || 0,
          isHost: p.isHost
        })));
      })
      .on('broadcast', { event: 'game_state' }, ({ payload }) => {
        setGameState(payload.state);
        if (payload.settings) setSettings(payload.settings);
        if (payload.question) setCurrentQuestion(payload.question);
        if (payload.targetPlayer) setTargetPlayer(payload.targetPlayer);
        if (payload.round) setCurrentRound(payload.round);
        // Reset round state when new round starts
        if (payload.state === GameState.ROUND_ANSWERING) {
          setRoundAnswers([]);
          setRevealedIdx([]);
          setPlayerInput('');
          setTimer(payload.settings?.timer || 45);
          setWinnerIdx(null);
        }
        // Sync scores when receiving final results
        if (payload.scores) {
          setScores(payload.scores);
        }
      })
      .on('broadcast', { event: 'new_answer' }, ({ payload }) => {
        // Prevent duplicate answers from the same player
        setRoundAnswers(prev => {
          if (prev.some(a => a.playerId === payload.playerId)) return prev;
          return [...prev, payload];
        });
      })
      .on('broadcast', { event: 'round_end' }, ({ payload }) => {
        setWinnerIdx(payload.winnerIndex);
        // Reveal all answers
        setRevealedIdx(roundAnswers.map((_, i) => i));
        // Sync scores from host
        if (payload.scores) {
          setScores(payload.scores);
        }
        setTimeout(() => {
          // Check if this was the last round
          if (payload.currentRound >= settings.rounds) {
            setGameState(GameState.FINAL_RESULTS);
          } else {
            setGameState(GameState.SCORING);
          }
        }, 4000);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ id: myId, name: playerName, avatar: avatarUrl, isHost, score: 0 });
        }
      });

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [roomCode, playerName, avatarUrl]);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (gameState === GameState.ROUND_ANSWERING && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (gameState === GameState.ROUND_ANSWERING && timer === 0) {
      if (myId !== targetPlayer?.id) submitAnswer();
    }
    return () => clearInterval(interval);
  }, [gameState, timer]);

  // Auto-transition to guessing when all answers are in
  useEffect(() => {
    const expectedAnswers = players.length - 1; // Everyone except the judge
    if (gameState === GameState.ROUND_ANSWERING && roundAnswers.length >= expectedAnswers && expectedAnswers > 0) {
      setGameState(GameState.ROUND_GUESSING);
    }
  }, [roundAnswers, players, gameState]);

  // Handlers
  const handleAction = () => audioService.playAction();

  const createRoom = () => {
    handleAction();
    setIsHost(true);
    setGameState(GameState.ROOM_SETUP);
  };

  const finalizeSetup = () => {
    handleAction();
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    setGameState(GameState.AVATAR_PICKER);
  };

  const startMatch = async () => {
    if (!isHost) return;
    setIsLoading(true);
    try {
      const target = players[Math.floor(Math.random() * players.length)];
      const cat = CATEGORIES.find(c => c.id === settings.categoryId)?.name || 'Essência';
      const qText = await geminiService.generateQuestion(cat, target.name);

      const question = { id: Date.now().toString(), text: qText, category: cat, targetPlayerId: target.id };
      const nextRound = gameState === GameState.LOBBY ? 1 : currentRound + 1;

      // Update local state for host
      setCurrentQuestion(question);
      setTargetPlayer(target);
      setCurrentRound(nextRound);
      setRoundAnswers([]);
      setRevealedIdx([]);
      setPlayerInput('');
      setTimer(settings.timer);
      setGameState(GameState.ROUND_ANSWERING);

      // Broadcast to other players
      channelRef.current.send({
        type: 'broadcast',
        event: 'game_state',
        payload: { state: GameState.ROUND_ANSWERING, question, targetPlayer: target, round: nextRound, settings }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const submitAnswer = () => {
    if (!playerInput || !channelRef.current) return;

    const answerPayload = { playerId: myId, name: playerName, avatar: avatarUrl, answer: playerInput };

    // Add to local state immediately
    setRoundAnswers(prev => [...prev, answerPayload]);
    setGameState(GameState.ROUND_GUESSING);

    // Broadcast to other players
    channelRef.current.send({
      type: 'broadcast',
      event: 'new_answer',
      payload: answerPayload
    });

    setPlayerInput('');
  };

  const handleJudgePick = (idx: number) => {
    if (myId !== targetPlayer?.id) return;
    const winner = roundAnswers[idx];

    // Calculate new scores
    const newScores = {
      ...scores,
      ...(winner ? { [winner.playerId]: (scores[winner.playerId] || 0) + 1 } : {})
    };

    // Update local state immediately for the judge
    setWinnerIdx(idx);
    setRevealedIdx(roundAnswers.map((_, i) => i));
    setScores(newScores);

    // Broadcast to others with scores
    channelRef.current.send({
      type: 'broadcast',
      event: 'round_end',
      payload: { winnerIndex: idx, winnerId: winner?.playerId, scores: newScores, currentRound }
    });

    setTimeout(() => {
      if (currentRound >= settings.rounds) {
        setGameState(GameState.FINAL_RESULTS);
        // Broadcast final results with scores
        channelRef.current.send({
          type: 'broadcast',
          event: 'game_state',
          payload: { state: GameState.FINAL_RESULTS, scores: newScores }
        });
      } else {
        setGameState(GameState.SCORING);
      }
    }, 4000);
  };

  // Renderers
  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12 animate-in fade-in zoom-in-95">
      <div className="text-center space-y-4">
        <h1 className="text-9xl font-black brand-gradient tracking-tighter glow-text">!juizo</h1>
        <p className="text-neutral-500 tracking-[0.4em] uppercase text-[10px] font-black opacity-60">Insight - Play With Friends</p>
      </div>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Button onClick={createRoom}>Criar Nova Sala</Button>
        <Button variant="outline" onClick={() => setGameState(GameState.ROOM_SELECTION)}>Entrar em Sala</Button>
      </div>
    </div>
  );

  const renderSetup = () => (
    <div className="max-w-md mx-auto py-12 space-y-12 animate-in slide-in-from-bottom-8">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-black tracking-tighter">Configurações</h2>
        <p className="text-neutral-500 text-xs uppercase tracking-widest">Defina as regras da partida</p>
      </div>

      <div className="space-y-8 glass-card p-8">
        <div className="space-y-4">
          <label className="text-[10px] font-black uppercase text-neutral-500 flex items-center gap-2"><Sparkles size={12} /> Categoria</label>
          <div className="grid grid-cols-1 gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSettings({ ...settings, categoryId: cat.id })}
                className={`p-4 rounded-2xl text-left transition-all border ${settings.categoryId === cat.id ? 'bg-fuchsia-500/10 border-fuchsia-500 text-white' : 'bg-white/5 border-white/5 text-neutral-500 hover:border-white/20'}`}
              >
                <div className="font-bold text-sm">{cat.name}</div>
                <div className="text-[10px] opacity-60">{cat.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-neutral-500">Rodadas</label>
            <input type="number" value={settings.rounds} onChange={e => setSettings({ ...settings, rounds: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-fuchsia-500" />
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-neutral-500">Tempo (s)</label>
            <input type="number" value={settings.timer} onChange={e => setSettings({ ...settings, timer: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-fuchsia-500" />
          </div>
        </div>
      </div>
      <Button fullWidth onClick={finalizeSetup}>Próximo <ChevronRight size={18} /></Button>
    </div>
  );

  const renderAvatarPicker = () => (
    <div className="max-w-md mx-auto py-12 space-y-12 text-center animate-in fade-in">
      <div className="space-y-8">
        <div className="relative inline-block group">
          <div className="w-48 h-48 rounded-full bg-neutral-900 p-2 border-4 border-white/5 overflow-hidden shadow-[0_0_50px_rgba(217,70,239,0.15)] transition-transform group-hover:scale-105">
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <button onClick={() => { setAvatarSeed(Math.random().toString(36).substring(7)); handleAction(); }} className="absolute bottom-2 right-2 bg-fuchsia-600 p-4 rounded-full shadow-2xl hover:bg-fuchsia-500 transition-all hover:rotate-90 active:scale-90">
            <RefreshCw size={24} />
          </button>
        </div>
        <input type="text" placeholder="Seu apelido..." value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-transparent border-b-2 border-white/10 py-4 text-4xl text-center font-light focus:outline-none focus:border-fuchsia-500 transition-all" />
      </div>
      <Button fullWidth onClick={() => setGameState(GameState.LOBBY)} disabled={!playerName}>Entrar na Sala</Button>
    </div>
  );

  const renderLobby = () => (
    <div className="max-w-4xl mx-auto py-12 space-y-16 animate-in fade-in">
      <div className="flex flex-col items-center gap-6">
        <div className="bg-fuchsia-500/10 border border-fuchsia-500/20 px-8 py-4 rounded-[2rem] flex items-center gap-4 group cursor-copy" onClick={() => { navigator.clipboard.writeText(roomCode); handleAction(); }}>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-500/60">Código da Sala:</span>
          <span className="text-4xl font-mono font-black text-white">{roomCode}</span>
          <UserPlus size={20} className="text-fuchsia-500 group-hover:scale-110 transition-transform" />
        </div>
        <p className="text-neutral-500 text-xs font-bold uppercase tracking-widest animate-pulse">Aguardando outros jogadores...</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
        {players.map(p => (
          <div key={p.id} className="space-y-3 group animate-in zoom-in-75">
            <div className="relative">
              <img src={p.avatar} className="w-24 h-24 rounded-full mx-auto border-2 border-white/5 transition-all group-hover:border-fuchsia-500/50" />
              {p.isHost && <span className="absolute -top-1 -right-1 bg-fuchsia-500 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase">Host</span>}
            </div>
            <p className="text-center text-xs font-bold text-neutral-400">{p.name} {p.id === myId && '(Você)'}</p>
          </div>
        ))}
      </div>

      {isHost && players.length >= 2 && (
        <div className="flex justify-center pt-12">
          <Button onClick={startMatch} isLoading={isLoading} className="px-16 text-xl">Começar Partida <Play size={20} /></Button>
        </div>
      )}
    </div>
  );

  const renderAnswering = () => (
    <div className="max-w-2xl mx-auto py-12 text-center space-y-12 animate-in zoom-in-95">
      <div className="space-y-6">
        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">
          <span className="bg-white/5 px-4 py-1.5 rounded-full border border-white/5">Juiz: {targetPlayer?.name}</span>
          <span className="flex items-center gap-2"><Clock size={14} /> {timer}s</span>
        </div>
        <h2 className="text-5xl font-light leading-tight tracking-tight">"{currentQuestion?.text}"</h2>
        {myId === targetPlayer?.id && (
          <div className="bg-fuchsia-500/10 border border-fuchsia-500/20 p-6 rounded-[2rem]">
            <p className="text-fuchsia-500 text-sm font-bold animate-pulse">VOCÊ É O JUIZ. AGUARDE AS RESPOSTAS.</p>
          </div>
        )}
      </div>

      {myId !== targetPlayer?.id && (
        <div className="space-y-8">
          <textarea
            autoFocus value={playerInput} onChange={e => setPlayerInput(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-[3rem] p-12 text-3xl font-light focus:outline-none focus:border-white/20 min-h-[300px] text-center"
            placeholder="Qual o seu juízo?"
          />
          <Button fullWidth onClick={submitAnswer} className="text-xl">Enviar Resposta</Button>
        </div>
      )}
    </div>
  );

  const renderGuessing = () => (
    <div className="max-w-6xl mx-auto py-12 space-y-12 animate-in fade-in">
      <div className="text-center space-y-4">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-500/60">Rodada {currentRound} de {settings.rounds}</p>
        <h2 className="text-4xl font-light">
          {winnerIdx !== null
            ? "🎉 Resposta Escolhida!"
            : myId === targetPlayer?.id
              ? "Escolha a melhor resposta:"
              : `${targetPlayer?.name} está decidindo...`}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto px-4">
        {roundAnswers.map((item, idx) => (
          <div
            key={idx}
            className={`glass-card p-6 space-y-4 transition-all duration-500 ${winnerIdx === idx
              ? 'ring-4 ring-fuchsia-500 shadow-[0_0_40px_rgba(217,70,239,0.3)] scale-105'
              : winnerIdx !== null
                ? 'opacity-50'
                : 'hover:border-white/20 cursor-pointer'
              }`}
            onClick={() => winnerIdx === null && handleJudgePick(idx)}
          >
            <p className="text-2xl font-light leading-relaxed">"{item.answer}"</p>
            {revealedIdx.includes(idx) && (
              <div className="flex items-center gap-3 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-bottom-4">
                <img src={item.avatar} className="w-10 h-10 rounded-full border-2 border-white/10" />
                <div>
                  <p className="font-bold text-sm">{item.name}</p>
                  {winnerIdx === idx && <span className="text-fuchsia-500 text-xs font-bold">+1 ponto</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20 px-6 pt-10">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-16 relative z-50">
        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.reload()}>
          <div className="text-2xl font-black tracking-tighter brand-gradient">!juizo</div>
        </div>
        {roomCode && <div className="bg-white/5 px-4 py-2 rounded-full border border-white/5 text-[10px] font-black uppercase text-neutral-500">SALA: {roomCode}</div>}
      </header>

      <main className="max-w-7xl mx-auto relative z-10">
        {gameState === GameState.HOME && renderHome()}
        {gameState === GameState.ROOM_SETUP && renderSetup()}
        {gameState === GameState.ROOM_SELECTION && (
          <div className="max-w-xs mx-auto py-20 space-y-12 text-center animate-in slide-in-from-bottom-8">
            <h2 className="text-2xl font-light">Código da Sala</h2>
            <input type="text" maxLength={4} placeholder="0000" value={roomCode} onChange={e => { setRoomCode(e.target.value); handleAction(); }} className="w-full bg-white/5 border-b-2 border-white/20 py-4 text-6xl text-center font-mono focus:outline-none focus:border-fuchsia-500 transition-all" />
            <Button fullWidth onClick={() => setGameState(GameState.AVATAR_PICKER)} disabled={roomCode.length < 4}>Avançar</Button>
          </div>
        )}
        {gameState === GameState.AVATAR_PICKER && renderAvatarPicker()}
        {gameState === GameState.LOBBY && renderLobby()}
        {(gameState === GameState.ROUND_ANSWERING || (gameState === GameState.ROUND_GUESSING && roundAnswers.length < players.length - 1)) && renderAnswering()}
        {gameState === GameState.ROUND_GUESSING && roundAnswers.length >= players.length - 1 && renderGuessing()}

        {gameState === GameState.SCORING && (
          <div className="max-w-4xl mx-auto py-12 text-center space-y-12 animate-in zoom-in-95">
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-500/60">Rodada {currentRound} de {settings.rounds}</p>
              <h2 className="text-5xl font-black uppercase tracking-tighter brand-gradient">Placar Atual</h2>
            </div>

            {/* Current scores */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {players
                .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
                .map((p, idx) => (
                  <div key={p.id} className={`glass-card p-4 space-y-3 ${idx === 0 && scores[p.id] ? 'ring-2 ring-fuchsia-500' : ''}`}>
                    <img src={p.avatar} className="w-16 h-16 rounded-full mx-auto border-2 border-white/10" />
                    <p className="font-bold text-sm truncate">{p.name}</p>
                    <p className="text-3xl font-black text-fuchsia-500">{scores[p.id] || 0}</p>
                  </div>
                ))}
            </div>

            {isHost && (
              <Button onClick={() => { setWinnerIdx(null); startMatch(); }} className="mx-auto px-16">
                Próxima Rodada <ChevronRight size={20} />
              </Button>
            )}
          </div>
        )}

        {gameState === GameState.FINAL_RESULTS && (
          <div className="max-w-4xl mx-auto py-12 text-center space-y-16 animate-in zoom-in-95">
            <div className="space-y-4">
              <h2 className="text-7xl font-black uppercase tracking-tighter brand-gradient glow-text">🏆 Resultado Final</h2>
              <p className="text-neutral-400 text-lg">A partida terminou! Veja quem dominou.</p>
            </div>

            {/* Ranking */}
            <div className="space-y-4 max-w-xl mx-auto">
              {players
                .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
                .map((p, idx) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const medal = medals[idx] || `${idx + 1}º`;
                  const isWinner = idx === 0;

                  return (
                    <div
                      key={p.id}
                      className={`glass-card p-6 flex items-center gap-6 transition-all ${isWinner
                        ? 'ring-2 ring-fuchsia-500 shadow-[0_0_40px_rgba(217,70,239,0.2)] scale-105'
                        : ''
                        }`}
                    >
                      <span className="text-4xl">{medal}</span>
                      <img src={p.avatar} className={`w-16 h-16 rounded-full border-2 ${isWinner ? 'border-fuchsia-500' : 'border-white/10'}`} />
                      <div className="flex-1 text-left">
                        <p className={`font-bold text-lg ${isWinner ? 'text-white' : 'text-neutral-400'}`}>
                          {p.name} {p.id === myId && '(Você)'}
                        </p>
                        {isWinner && <span className="text-fuchsia-500 text-sm font-bold">VENCEDOR!</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-black text-fuchsia-500">{scores[p.id] || 0}</p>
                        <p className="text-[10px] uppercase tracking-wider text-neutral-500">pontos</p>
                      </div>
                    </div>
                  );
                })}
            </div>

            <Button onClick={() => window.location.reload()} className="mx-auto px-16">
              Jogar Novamente
            </Button>
          </div>
        )}
      </main>

      <div className="bg-blob fixed top-[-30%] right-[-20%] w-[80%] h-[80%] bg-fuchsia-600/5 rounded-full" />
      <div className="bg-blob fixed bottom-[-30%] left-[-20%] w-[80%] h-[80%] bg-white/5 rounded-full" />
    </div>
  );
};

export default App;
