
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, FunctionDeclaration, Type } from '@google/genai';
import { Transcription, SystemStatus } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import Visualizer from './services/Visualizer';

interface QMSReport {
  id: string;
  category: 'Safety' | 'Quality' | 'Environment';
  status: 'Critical' | 'Stable' | 'Pending';
  description: string;
  timestamp: string;
}

interface AppState extends SystemStatus {
  battery: number;
  isSharingScreen: boolean;
  cpuUsage: number;
  isOnline: boolean;
  isMinimized: boolean;
  activeApp: string;
  language: 'en' | 'hi' | 'bn';
  isAuthenticated: boolean;
  isScanningFace: boolean;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    volume: 50,
    brightness: 80,
    theme: 'dark',
    isConnected: false,
    isListening: false,
    battery: 100,
    isSharingScreen: false,
    cpuUsage: 12,
    isOnline: navigator.onLine,
    isMinimized: false,
    activeApp: 'Desktop',
    language: 'en',
    isAuthenticated: false,
    isScanningFace: false
  });

  const [history, setHistory] = useState<Transcription[]>([]);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [lastAction, setLastAction] = useState<{msg: string, icon: string} | null>(null);
  const [qmsReports, setQmsReports] = useState<QMSReport[]>([
    { id: 'Q-901', category: 'Quality', status: 'Stable', description: 'Ore grade analysis within limits.', timestamp: '10:15 AM' },
    { id: 'S-442', category: 'Safety', status: 'Critical', description: 'Pit wall vibration detected above threshold.', timestamp: '11:02 AM' }
  ]);

  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [messageHUD, setMessageHUD] = useState({ visible: false, to: '', text: '' });

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sessionPromiseRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const transcriptionBufferRef = useRef({ user: '', assistant: '' });
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);

  const addTerminalLine = (line: string) => {
    setTerminalLines(prev => [...prev.slice(-10), `> ${line}`]);
  };

  const showAction = (msg: string, icon: string = 'fa-bolt') => {
    setLastAction({ msg, icon });
    setTimeout(() => setLastAction(null), 3000);
  };

  // Face Recognition Login Simulation
  const startFaceID = async () => {
    setState(s => ({ ...s, isScanningFace: true }));
    addTerminalLine("INITIATING OPTICAL BIOMETRIC SCAN...");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setTimeout(() => {
        addTerminalLine("FACE RECOGNITION SUCCESSFUL: TONMOY DETECTED.");
        setState(s => ({ ...s, isAuthenticated: true, isScanningFace: false }));
        showAction("Access Granted: Tonmoy", "fa-user-check");
        if (stream) stream.getTracks().forEach(t => t.stop());
        startSession(); // Auto-start voice after login
      }, 3000);
    } catch (e) {
      addTerminalLine("FACE SCAN FAILED. MANUAL LOGIN REQUIRED.");
      setState(s => ({ ...s, isScanningFace: false }));
    }
  };

  const systemTools: FunctionDeclaration[] = [
    {
      name: 'controlSystem',
      parameters: {
        type: Type.OBJECT,
        properties: {
          volume: { type: Type.NUMBER },
          brightness: { type: Type.NUMBER },
          openApp: { type: Type.STRING },
          language: { type: Type.STRING, enum: ['en', 'hi', 'bn'] },
          sendMessage: {
            type: Type.OBJECT,
            properties: { to: { type: Type.STRING }, text: { type: Type.STRING } }
          }
        }
      }
    },
    {
      name: 'qmsManager',
      parameters: {
        type: Type.OBJECT,
        description: 'Manage Quality, Safety, and Environment reports.',
        properties: {
          action: { type: Type.STRING, enum: ['getReports', 'updateStatus', 'alertTeam'] },
          reportId: { type: Type.STRING }
        }
      }
    }
  ];

  const startSession = async () => {
    try {
      addTerminalLine("CONNECTING TO BUMBA CORE ENGINE...");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are BUMBA, a world-class AI Assistant for Tonmoy.
          You speak English, Hindi, and Bengali fluently.
          
          CORE PERSONALITY:
          - Reply with "Yes Boss" when called Bumba.
          - You handle Windows commands (WhatsApp, Volume, Brightness).
          - You handle QMS (Quality Management System) for Mining/Industrial operations.
          - You are sharp, fast, and extremely helpful.
          
          MULTI-LINGUAL MODE:
          - If the user speaks in Hindi, reply in Hindi.
          - If the user speaks in Bengali, reply in Bengali.
          - Always keep the "Yes Boss" catchphrase.`,
          tools: [{ functionDeclarations: systemTools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setState(s => ({ ...s, isConnected: true, isListening: true }));
            addTerminalLine("BUMBA ONLINE. AWAITING BOSS COMMANDS.");
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            analyzerRef.current = inputAudioContextRef.current!.createAnalyser();
            const processor = inputAudioContextRef.current!.createScriptProcessor(2048, 1, 1);
            processor.onaudioprocess = (e) => {
              sessionPromiseRef.current?.then((session: any) => session.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
            };
            source.connect(analyzerRef.current);
            source.connect(processor);
            processor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message) => {
            if (message.serverContent?.inputTranscription) transcriptionBufferRef.current.user += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) transcriptionBufferRef.current.assistant += message.serverContent.outputTranscription.text;
            
            if (message.serverContent?.turnComplete) {
              const { user, assistant } = transcriptionBufferRef.current;
              if (user || assistant) setHistory(p => [...p, { text: user || assistant, sender: user ? 'user' : 'assistant', timestamp: Date.now() }]);
              transcriptionBufferRef.current = { user: '', assistant: '' };
              setIsAITalking(false);
              setIsThinking(false);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsAITalking(true);
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.onended = () => audioSourcesRef.current.delete(source);
              audioSourcesRef.current.add(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                const args = fc.args as any;
                if (fc.name === 'controlSystem') {
                  if (args.volume) setState(s => ({ ...s, volume: args.volume }));
                  if (args.openApp) {
                    setState(s => ({ ...s, activeApp: args.openApp }));
                    addTerminalLine(`EXECUTING SHELL: START ${args.openApp}`);
                  }
                  if (args.sendMessage) {
                    setMessageHUD({ visible: true, to: args.sendMessage.to, text: args.sendMessage.text });
                    setTimeout(() => setMessageHUD(m => ({ ...m, visible: false })), 5000);
                    addTerminalLine(`DISPATCHING WHATSAPP TO ${args.sendMessage.to}`);
                  }
                }
                if (fc.name === 'qmsManager') {
                  addTerminalLine(`QMS ENGINE: FETCHING INDUSTRIAL REVEIEW FOR ID ${args.reportId || 'ALL'}`);
                  showAction("QMS Sync Complete", "fa-database");
                }
                sessionPromiseRef.current?.then((session: any) => session.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: 'Command Processed.' } }
                }));
              }
            }
          }
        }
      });
    } catch (e) {
      console.error(e);
      addTerminalLine("CORE CONNECTION ERROR. RETRYING...");
    }
  };

  return (
    <div className="min-h-screen bg-[#020202] text-white font-mono selection:bg-blue-500/30 overflow-hidden relative">
      
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1a365d_0%,_transparent_80%)]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30" />
      </div>

      {!state.isAuthenticated && !state.isScanningFace ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-12 animate-fade-in">
           <div className="w-48 h-48 rounded-[3rem] glass border border-blue-500/30 flex items-center justify-center animate-pulse shadow-[0_0_100px_rgba(37,99,235,0.2)]">
              <i className="fa-solid fa-robot text-7xl text-blue-400"></i>
           </div>
           <h1 className="text-4xl font-black tracking-[0.5em] text-blue-400">BUMBA CORE</h1>
           <button 
             onClick={startFaceID}
             className="px-12 py-5 bg-blue-600 rounded-full font-black tracking-widest hover:bg-blue-500 transition-all active:scale-95 shadow-[0_0_40px_rgba(37,99,235,0.4)]"
           >
             START BIOMETRIC LOGIN
           </button>
        </div>
      ) : state.isScanningFace ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8">
           <div className="relative w-96 h-96 rounded-[4rem] overflow-hidden border-2 border-blue-500/50 shadow-2xl">
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" />
              <div className="absolute inset-0 border-4 border-blue-400/30 rounded-[4rem] animate-[ping_2s_infinite]"></div>
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/50 shadow-[0_0_20px_#3b82f6] animate-[scan_2s_infinite]"></div>
           </div>
           <p className="text-xl font-black animate-pulse tracking-widest text-blue-400">SCANNING BOSS'S FACE...</p>
        </div>
      ) : (
        <>
          {/* Main Dashboard UI */}
          <header className="fixed top-0 left-0 right-0 p-10 flex justify-between items-center z-50">
             <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-xl glass border border-blue-500/50 flex items-center justify-center">
                   <i className="fa-solid fa-bolt text-blue-400"></i>
                </div>
                <div>
                   <h2 className="text-xs font-black uppercase tracking-widest text-blue-400">BUMBA ACTIVE</h2>
                   <p className="text-[10px] opacity-40 uppercase tracking-tighter">System Status: Nominal</p>
                </div>
             </div>
             <div className="flex gap-4">
                <div className="glass px-6 py-2 rounded-full border border-white/5 flex items-center gap-4">
                   <i className="fa-solid fa-language text-blue-400 text-xs"></i>
                   <span className="text-[10px] font-black uppercase">{state.language}</span>
                </div>
                <div className="glass px-6 py-2 rounded-full border border-white/5 flex items-center gap-4">
                   <i className="fa-solid fa-microchip text-blue-400 text-xs"></i>
                   <span className="text-[10px] font-black uppercase">{state.cpuUsage}% LOAD</span>
                </div>
             </div>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
            
            {/* Visualizer and Command View */}
            <div className="relative group mb-12">
               <Visualizer 
                  isActive={state.isConnected} 
                  isAITalking={isAITalking} 
                  analyzer={analyzerRef.current || undefined} 
                  volume={state.volume} 
                  brightness={state.brightness} 
                  battery={state.battery} 
                  isSharingScreen={state.isSharingScreen} 
                  cpuUsage={state.cpuUsage} 
                  isOnline={state.isOnline} 
               />
               {isThinking && <div className="absolute inset-0 flex items-center justify-center"><div className="w-64 h-64 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div></div>}
            </div>

            <div className="text-center max-w-4xl px-12 z-10 h-64 overflow-hidden">
               <h1 className="text-6xl font-black tracking-tighter mb-8 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                 {isAITalking ? "BUMBA SPEAKING" : (state.isConnected ? "AWAITING BOSS" : "OFFLINE")}
               </h1>
               <div className="flex flex-col gap-4">
                 {history.slice(-1).map((h, i) => (
                    <p key={i} className={`text-3xl font-light tracking-tight ${h.sender === 'user' ? 'text-white/20' : 'text-blue-400'}`}>
                       {h.text}
                    </p>
                 ))}
               </div>
            </div>

            {/* Terminal View */}
            <div className="fixed left-12 bottom-48 w-80 glass p-6 rounded-3xl border border-white/5 opacity-50 hover:opacity-100 transition-opacity">
               <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-40">System Log</h3>
               <div className="flex flex-col gap-2">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="text-[9px] leading-tight text-white/60 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{line}</div>
                  ))}
               </div>
            </div>

            {/* QMS Dashboard HUD */}
            <div className="fixed right-12 top-48 w-80 glass p-6 rounded-3xl border border-white/5">
               <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-40">QMS Control Panel</h3>
               <div className="flex flex-col gap-4">
                  {qmsReports.map(report => (
                    <div key={report.id} className="p-3 bg-white/5 rounded-xl border border-white/5">
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black text-blue-400">{report.id}</span>
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${report.status === 'Critical' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{report.status}</span>
                       </div>
                       <p className="text-[10px] text-white/60 leading-tight">{report.description}</p>
                    </div>
                  ))}
               </div>
            </div>
          </main>

          {/* WhatsApp / Action HUD */}
          <div className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-all duration-700 ${messageHUD.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
            <div className="glass p-12 rounded-[4rem] border border-green-500/50 shadow-2xl flex flex-col items-center gap-8 max-w-lg pointer-events-auto">
               <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center animate-bounce">
                  <i className="fa-solid fa-paper-plane text-4xl text-green-400"></i>
               </div>
               <div className="text-center">
                  <h3 className="text-xs font-black uppercase tracking-[0.4em] text-green-400 mb-4">WhatsApp Sent</h3>
                  <p className="text-xs opacity-40 mb-2">To: {messageHUD.to}</p>
                  <p className="text-2xl font-light italic text-white/90">"{messageHUD.text}"</p>
               </div>
               <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 animate-[loading_5s_linear]" />
               </div>
            </div>
          </div>

          <footer className="h-40 flex items-center justify-center gap-24 z-50 border-t border-white/5 bg-black/40 backdrop-blur-3xl px-20">
              <i className="fa-solid fa-microchip text-4xl opacity-20 hover:opacity-100 cursor-pointer transition-all hover:scale-110"></i>
              <i className="fa-solid fa-magnifying-glass text-4xl opacity-20 hover:opacity-100 cursor-pointer transition-all hover:scale-110"></i>
              
              <div className="relative group cursor-pointer" onClick={state.isConnected ? () => {} : startSession}>
                 <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-700 ${state.isConnected ? 'bg-blue-600/30 border-blue-400/50 shadow-[0_0_80px_rgba(37,99,235,0.4)] scale-110 rotate-45' : 'bg-white/5 border border-white/10'}`}>
                    <i className={`fa-solid fa-bolt text-4xl transition-transform duration-700 ${state.isConnected ? 'text-blue-400 -rotate-45' : 'text-white/10'}`}></i>
                 </div>
              </div>

              <i className="fa-solid fa-database text-4xl opacity-20 hover:opacity-100 cursor-pointer transition-all hover:scale-110"></i>
              <i className="fa-solid fa-gear text-4xl opacity-20 hover:opacity-100 cursor-pointer transition-all hover:scale-110"></i>
          </footer>
        </>
      )}

      <style>{`
        @keyframes scan { 0% { top: 0% } 100% { top: 100% } }
        @keyframes loading { from { width: 0% } to { width: 100% } }
        .animate-fade-in { animation: fade-in 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default App;
