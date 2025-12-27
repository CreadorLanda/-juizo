
import React from 'react';

interface FlashcardProps {
  answer?: string;
  onSelect?: () => void;
  index: number;
  isAuthorRevealed: boolean;
  playerName?: string;
  playerAvatar?: string;
}

export const Flashcard: React.FC<FlashcardProps> = ({ 
  answer, 
  onSelect, 
  index, 
  isAuthorRevealed,
  playerName,
  playerAvatar
}) => {
  const hasAnswer = !!answer;

  return (
    <div 
      onClick={hasAnswer && !isAuthorRevealed ? onSelect : undefined}
      className={`group relative h-60 w-full cursor-pointer perspective-1000 animate-in fade-in slide-in-from-bottom-6 duration-700 ${!hasAnswer ? 'opacity-50 grayscale cursor-wait' : ''}`}
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className={`relative h-full w-full transition-all duration-700 [transform-style:preserve-3d] ${isAuthorRevealed ? '[transform:rotateY(180deg)]' : 'group-hover:scale-[1.02]'}`}>
        
        {/* Front */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-[2.5rem] border p-8 shadow-xl backdrop-blur-sm [backface-visibility:hidden] transition-all duration-500 ${
          hasAnswer 
          ? 'bg-neutral-900/60 border-white/20' 
          : 'bg-neutral-900/20 border-white/5 border-dashed'
        }`}>
          {hasAnswer ? (
            <>
              <p className="text-center text-xl font-light leading-relaxed text-neutral-100 italic">
                "{answer}"
              </p>
              <div className="absolute bottom-6 opacity-0 group-hover:opacity-40 transition-opacity text-[10px] uppercase tracking-[0.3em] font-bold">
                Selecionar Resposta
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
               <div className="flex gap-1">
                 <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                 <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                 <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></div>
               </div>
               <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-neutral-600">Escrevendo...</p>
            </div>
          )}
        </div>

        {/* Back */}
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2.5rem] border border-fuchsia-500/30 bg-fuchsia-500/5 p-8 shadow-xl backdrop-blur-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
           <div className="text-center space-y-4">
              <img src={playerAvatar} className="w-16 h-16 rounded-full mx-auto border-2 border-fuchsia-500 shadow-lg mb-2" alt={playerName} />
              <p className="text-2xl font-black text-white brand-gradient tracking-tighter">{playerName}</p>
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest">Autor da Resposta</p>
           </div>
        </div>
        
      </div>
    </div>
  );
};
