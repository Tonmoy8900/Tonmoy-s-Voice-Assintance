import React from 'react';

const MyraAvatar: React.FC<{ isTalking: boolean; level: number }> = ({ isTalking, level }) => {
  const mouthOpenness = isTalking ? Math.min(1, level * 18) : 0;

  return (
    <div className="relative z-20 transition-all duration-700 hover:scale-105 avatar-aura">
      <svg viewBox="0 0 400 500" className="w-[450px] h-[550px] drop-shadow-2xl">
        <path d="M185 320 L215 320 L215 360 L185 360 Z" fill="#fee2e2" />
        <path d="M90 440 Q200 340 310 440 L310 500 L90 500 Z" fill="#1e1b4b" />
        <path d="M175 365 L225 365 L240 400 L160 400 Z" fill="#312e81" />
        <circle cx="200" cy="230" r="95" fill="#fee2e2" />
        <path d="M105 230 Q105 110 200 110 Q295 110 295 230" fill="#0f172a" />
        
        {/* Blinking Eyes */}
        <g className="eye-blink">
          <circle cx="165" cy="220" r="9" fill="#1e293b" />
          <circle cx="235" cy="220" r="9" fill="#1e293b" />
          <circle cx="168" cy="217" r="3" fill="white" opacity="0.8" />
          <circle cx="238" cy="217" r="3" fill="white" opacity="0.8" />
        </g>
        
        {/* Syncing Mouth */}
        <path 
          d={isTalking 
            ? `M180 288 Q200 ${288 + 40 * mouthOpenness} 220 288` 
            : "M188 292 Q200 295 212 292"
          }
          stroke="#e11d48" 
          strokeWidth="4" 
          fill={isTalking ? "#4c0519" : "none"} 
          strokeLinecap="round"
        />

        {/* Ponytail */}
        <path d="M295 180 Q370 180 370 280 Q370 380 310 350" fill="#0f172a" className="ponytail-anim" />
        <path d="M105 230 Q120 125 200 120 Q280 125 295 230 L295 210 Q280 140 200 135 Q120 140 105 210 Z" fill="#1e293b" />
      </svg>
    </div>
  );
};

export default MyraAvatar;