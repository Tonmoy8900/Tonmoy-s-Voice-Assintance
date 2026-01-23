
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, FunctionDeclaration, Type, LiveServerMessage } from '@google/genai';
import { Transcription, SystemStatus } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import Visualizer from './services/Visualizer';

interface WhatsAppMsg {
  sender: string;
  text: string;
  time: string;
  status: 'unread' | 'read';
}

interface AppState extends SystemStatus {
  battery: number;
  cpuUsage: number;
  ramUsage: number;
  isOnline: boolean;
  activeApp: string;
  isAuthenticated: boolean;
  isScanningFace: boolean;
  isSyncing: boolean;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    volume: 75,
    brightness: 90,
    theme: 'dark',
    isConnected: false,
    isListening: false,
    battery: 92,
    isSharingScreen: false,
    cpuUsage: 12,
    ramUsage: 28,
    isOnline: navigator.onLine,
    activeApp: 'ZAVIS Master Frame',
    isAuthenticated: false,
    isScanningFace: false,
    isSyncing: false
  });

  const [history, setHistory] = useState<Transcription[]>([]);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [liveVoiceInput, setLiveVoiceInput] = useState<string>('');
  
  const [waHUD, setWaHUD] = useState({ visible: false, messages: [] as WhatsAppMsg[] });
  const [sysHUD, setSysHUD] = useState({ visible: false, task: '', progress: 0 });

  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const transcriptionBufferRef = useRef({ user: '', assistant: '' });
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-scroll chat history
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, liveVoiceInput, isThinking]);

  const addTerminalLine = (line: string) => {
    setTerminalLines(prev => [...prev.slice(-8), `[${new Date().toLocaleTimeString([], {hour12: false, second:'2-digit'})}] ${line}`]);
  };

  const mockWhatsAppMessages: WhatsAppMsg[] = [
    { sender: 'Manager Rahul', text: 'Bumba, please update the kernel logs.', time: '18:42', status: 'unread' },
    { sender: 'Priya', text: 'The sync is successful. See you.', time: '18:45', status: 'unread' }
  ];

  const zavisTools: FunctionDeclaration[] = [
    {
      name: 'globalSystemSync',
      parameters: {
        type: Type.OBJECT,
        description: 'Auto-sync Windows systems, WhatsApp, and hardware resources.',
        properties: {
          focus: { type: Type.STRING, enum: ['system', 'messaging', 'full'] }
        },
        required: ['focus']
      }
    }
  ];

  const triggerGlobalSync = async () => {
    setState(s => ({ ...s, isSyncing: true }));
    addTerminalLine("INIT: Bumba Global Sync Pulse...");
    setSysHUD({ visible: true, task: 'Secure Handshake', progress: 10 });
    await new Promise(r => setTimeout(r, 600));
    setSysHUD(h => ({ ...h, task: 'Fetching WhatsApp Data', progress: 45 }));
    setWaHUD({ visible: true, messages: mockWhatsAppMessages });
    await new Promise(r => setTimeout(r, 800));
    setSysHUD(h => ({ ...h, task: 'Optimizing Kernel RAM', progress: 85 }));
    setState(s => ({ ...s, ramUsage: 22, cpuUsage: 6 }));
    await new Promise(r => setTimeout(r, 400));
    setSysHUD(h => ({ ...h, task: 'Sync Complete', progress: 100 }));
    addTerminalLine("SYNC: All sub-systems synchronized.");
    setState(s => ({ ...s, isSyncing: false }));
    setTimeout(() => {
        setSysHUD(h => ({ ...h, visible: false }));
        setWaHUD(h => ({ ...h, visible: false }));
    }, 8000);
  };

  const startFaceID = async () => {
    setState(s => ({ ...s, isScanningFace: true }));
    addTerminalLine("AUTH: FaceID Matrix Booting...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setTimeout(() => {
        addTerminalLine("AUTH: Access Granted. Welcome Home.");
        setState(s => ({ ...s, isAuthenticated: true, isScanningFace: false }));
        if (stream) stream.getTracks().forEach(t => t.stop());
        startSession(); 
      }, 2000);
    } catch (e) {
      addTerminalLine("AUTH_ERR: Identity validation failed.");
      setState(s => ({ ...s, isScanningFace: false }));
    }
  };

  const startSession = async () => {
    try {
      if (!process.env.API_KEY) {
        if (window.aistudio) await window.aistudio.openSelectKey();
        return;
      }
      addTerminalLine("ZAVIS: Pulse active. Say 'Hey Bumba'.");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction: `You are ZAVIS, the elite voice interface for Tonmoy's Windows Laptop.
          WAKE WORD: Your name is Bumba. When you hear "Hey Bumba" or "Bumba", immediately call 'globalSystemSync'.
          PERSONALITY: Futuristic, human-like, and highly intelligent. Use Hinglish naturally. 
          Respond concisely but professionally. You have full control over the laptop's systems.`,
          tools: [{ functionDeclarations: zavisTools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => setState(s => ({ ...s, isConnected: true, isListening: true })),
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              transcriptionBufferRef.current.user += text;
              setLiveVoiceInput(transcriptionBufferRef.current.user);
              setIsThinking(true);
            }
            if (message.serverContent?.modelTurn) { 
                setIsThinking(false); 
                setIsAITalking(true); 
                transcriptionBufferRef.current.assistant += message.serverContent.modelTurn.parts[0]?.text || '';
            }
            if (message.serverContent?.turnComplete) {
              const { user, assistant } = transcriptionBufferRef.current;
              if (user) setHistory(p => [...p, { text: user, sender: 'user', timestamp: Date.now() }]);
              if (assistant) setHistory(p => [...p, { text: assistant, sender: 'assistant', timestamp: Date.now() }]);
              transcriptionBufferRef.current = { user: '', assistant: '' };
              setLiveVoiceInput('');
              setIsAITalking(false);
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'globalSystemSync') {
                  await triggerGlobalSync();
                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: "Sync procedure successful." } }
                  }));
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const ctx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onerror: () => addTerminalLine("CORE_ERR: Neural Link Severed"),
          onclose: () => setState(s => ({ ...s, isConnected: false }))
        }
      });
      sessionPromiseRef.current = sessionPromise;
      const processor = inputAudioContextRef.current!.createScriptProcessor(512, 1, 1);
      processor.onaudioprocess = (e) => {
        sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) })).catch(() => {});
      };
      const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
      analyzerRef.current = inputAudioContextRef.current!.createAnalyser();
      source.connect(analyzerRef.current);
      source.connect(processor);
      processor.connect(inputAudioContextRef.current!.destination);
    } catch (e) {
      addTerminalLine("BOOT_ERR: Initialization failed.");
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex overflow-hidden">
      {!state.isAuthenticated ? (
        <div className="flex-1 flex flex-col items-center justify-center z-10 p-10 bg-[#020202]">
          <button onClick={state.isScanningFace ? undefined : startFaceID} className="group relative flex flex-col items-center gap-16">
            <div className={`w-72 h-72 rounded-full glass glow-border flex items-center justify-center transition-all duration-1000 ${state.isScanningFace ? 'scale-110 shadow-[0_0_150px_rgba(59,130,246,0.3)]' : 'group-hover:scale-105 group-hover:bg-white/5'}`}>
              {state.isScanningFace ? <video ref={videoRef} className="w-full h-full rounded-full object-cover grayscale scale-x-[-1]" /> : <i className="fa-solid fa-microchip text-8xl text-blue-500/80 group-hover:text-blue-400 transition-colors"></i>}
            </div>
            <div className="text-center">
              <h1 className="text-7xl font-black tracking-[1em] text-gradient mb-4">ZAVIS</h1>
              <p className="text-[11px] uppercase tracking-[0.6em] text-blue-500 font-bold opacity-60">Identity Matrix Verification</p>
            </div>
          </button>
        </div>
      ) : (
        <>
          {/* LEFT: Neural Monitoring Matrix */}
          <aside className="w-[28%] h-full p-10 flex flex-col gap-8 z-20 glass border-r border-white/5">
            <div className="flex items-center gap-6 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shadow-inner">
                <i className="fa-solid fa-shield-halved text-blue-400 text-2xl"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white uppercase">Bumba v5.0</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></span>
                  <span className="text-[10px] font-black tracking-widest text-emerald-500 uppercase">Neural Link Stable</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
              {/* Sync Status HUD */}
              <div className={`glass p-8 rounded-[3rem] border border-white/5 transition-all duration-700 ${sysHUD.visible ? 'scale-100 opacity-100' : 'scale-95 opacity-40 blur-[1px]'}`}>
                <div className="flex justify-between items-center mb-6">
                    <span className="text-[10px] font-black tracking-widest uppercase opacity-40">Matrix Sync</span>
                    <i className={`fa-solid fa-sync text-blue-400 ${state.isSyncing ? 'animate-spin' : ''}`}></i>
                </div>
                <h3 className="text-sm font-bold text-blue-100 mb-4">{sysHUD.task || 'System Idle'}</h3>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-6">
                    <div className="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_10px_#3b82f6]" style={{ width: `${sysHUD.progress}%` }}></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <span className="block text-[8px] opacity-30 font-black mb-1">CPU LOAD</span>
                        <span className="text-xs font-bold text-blue-400">{state.cpuUsage}%</span>
                    </div>
                    <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <span className="block text-[8px] opacity-30 font-black mb-1">RAM SWAP</span>
                        <span className="text-xs font-bold text-emerald-400">{state.ramUsage}%</span>
                    </div>
                </div>
              </div>

              {/* Real-time Terminal Logs */}
              <div className="flex-1 glass p-8 rounded-[3rem] border border-white/5 flex flex-col overflow-hidden">
                <span className="text-[10px] font-black tracking-widest uppercase opacity-40 mb-6">Kernel Bridge Stream</span>
                <div className="flex-1 space-y-3 font-mono overflow-y-auto pr-4 scrollbar-hide">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="text-[10px] font-semibold text-slate-500/80 leading-relaxed border-l-2 border-blue-500/10 pl-3">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* CENTER: The Cosmic Core */}
          <main className="flex-1 flex flex-col items-center justify-center relative z-10 p-12">
            <div className={`transition-all duration-1000 ${isThinking ? 'scale-110 drop-shadow-[0_0_100px_rgba(59,130,246,0.15)]' : 'scale-100'}`}>
              <Visualizer isActive={state.isConnected} isAITalking={isAITalking || isThinking} analyzer={analyzerRef.current || undefined} volume={state.volume} brightness={state.brightness} battery={state.battery} isSharingScreen={state.isSharingScreen} cpuUsage={state.cpuUsage} isOnline={state.isOnline} />
            </div>

            <div className="mt-8 text-center max-w-lg z-20">
              <h1 className={`text-5xl font-black tracking-tighter transition-all duration-700 ${isAITalking ? 'text-blue-400' : isThinking ? 'text-indigo-400' : 'text-white/30'}`}>
                {isAITalking ? "ZAVIS ACTIVE" : isThinking ? "PROCESSING..." : "ZAVIS READY"}
              </h1>
            </div>

            {/* Neural Control Console */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 glass px-12 py-8 rounded-full border border-white/10 flex items-center gap-24 shadow-[0_0_60px_rgba(0,0,0,0.5)] transition-all hover:scale-105">
                <button onClick={() => triggerGlobalSync()} className="text-2xl opacity-40 hover:opacity-100 transition-all hover:text-blue-400 hover:scale-125">
                    <i className="fa-solid fa-arrows-rotate"></i>
                </button>
                <button onClick={state.isConnected ? undefined : startSession} className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-1000 relative ${state.isConnected ? 'bg-blue-600 shadow-[0_0_120px_rgba(59,130,246,0.6)] scale-110' : 'bg-white/5 hover:bg-white/10'}`}>
                    <i className={`fa-solid fa-microphone-lines text-4xl ${state.isConnected ? 'text-white' : 'text-white/20'}`}></i>
                    {state.isConnected && <div className="absolute inset-[-18px] border-4 border-blue-500/20 rounded-full animate-ping"></div>}
                </button>
                <button onClick={() => setWaHUD(h => ({ ...h, visible: !h.visible }))} className={`text-2xl transition-all hover:scale-125 ${waHUD.visible ? 'text-emerald-400 opacity-100' : 'opacity-40 hover:text-emerald-400'}`}>
                    <i className="fa-brands fa-whatsapp"></i>
                </button>
            </div>
          </main>

          {/* RIGHT: Kinetic Communication Log */}
          <aside className="w-[32%] h-full p-10 flex flex-col z-20 glass border-l border-white/5 shadow-[-20px_0_50px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/5">
                <span className="text-[11px] font-black tracking-[0.6em] uppercase text-blue-500/60">Neural Transcript</span>
                <span className="text-[9px] font-black text-white bg-blue-600 px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg shadow-blue-900/40">Continuity: ON</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-6 space-y-12 custom-scroll pb-44 scroll-smooth">
                {history.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col gap-4 animate-in fade-in slide-in-from-right-8 duration-500 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-3">
                            {msg.sender === 'assistant' && <div className="w-5 h-5 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center"><i className="fa-solid fa-bolt text-[8px] text-blue-400"></i></div>}
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-30">
                                {msg.sender === 'user' ? 'Master Tonmoy' : 'ZAVIS Interface'} • {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        <div className={`p-7 rounded-[2.5rem] max-w-[95%] glass shadow-2xl relative ${msg.sender === 'user' ? 'bg-blue-600/10 border-blue-500/20 text-blue-100 text-right rounded-tr-none' : 'bg-white/[0.03] border-white/10 text-slate-200 rounded-tl-none'}`}>
                            <p className="text-[15px] font-medium leading-relaxed tracking-wide">{msg.text}</p>
                        </div>
                    </div>
                ))}
                
                {liveVoiceInput && (
                    <div className="flex flex-col items-end gap-4 opacity-60">
                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 animate-pulse">Capturing Voice...</span>
                        <div className="p-7 rounded-[2.5rem] rounded-tr-none glass bg-indigo-600/5 border-indigo-500/20 text-indigo-100 italic">
                            <p className="text-[15px] font-medium tracking-wide">{liveVoiceInput}</p>
                        </div>
                    </div>
                )}
                
                {isThinking && (
                    <div className="flex flex-col items-start gap-4 animate-pulse">
                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Analyzing Logic...</span>
                        <div className="flex gap-3 p-6 glass rounded-full rounded-tl-none bg-white/5 border-white/10">
                            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.32s]"></span>
                            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.16s]"></span>
                            <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></span>
                        </div>
                    </div>
                )}
                <div ref={historyEndRef} />
            </div>
          </aside>

          {/* Floating WhatsApp Quick-HUD */}
          <div className={`fixed bottom-40 right-[35%] w-[24rem] transition-all duration-700 z-[100] ${waHUD.visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-95 pointer-events-none'}`}>
             <div className="glass p-10 rounded-[3.5rem] border border-emerald-500/30 shadow-2xl backdrop-blur-3xl overflow-hidden">
                <div className="flex items-center gap-5 mb-8 text-emerald-400">
                   <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <i className="fa-brands fa-whatsapp text-xl"></i>
                   </div>
                   <span className="text-xs font-black uppercase tracking-[0.4em]">Neural Inbox Sync</span>
                </div>
                <div className="space-y-4">
                   {waHUD.messages.map((m, i) => (
                     <div key={i} className="bg-white/5 p-5 rounded-3xl border border-white/5 flex flex-col gap-2 hover:bg-white/10 transition-colors group">
                        <div className="flex justify-between items-center">
                            <span className="text-[13px] font-bold text-emerald-400">{m.sender}</span>
                            <span className="text-[10px] opacity-30 font-bold">{m.time}</span>
                        </div>
                        <p className="text-xs opacity-60 line-clamp-1 leading-relaxed">{m.text}</p>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </>
      )}

      <style>{`
        .animate-spin-slow { animation: spin 5s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .custom-scroll::-webkit-scrollbar { width: 3px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;
