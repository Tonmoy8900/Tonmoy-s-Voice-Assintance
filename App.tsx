
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, FunctionDeclaration, Type, LiveServerMessage } from '@google/genai';
import { Transcription, SystemStatus } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import Visualizer from './services/Visualizer';

interface MailItem {
  id: string;
  from: string;
  subject: string;
  priority: 'High' | 'Normal';
}

interface WhatsAppMsg {
  sender: string;
  text: string;
  time: string;
}

interface PendingAction {
  id: string;
  type: 'DELETE' | 'SEND_MESSAGE' | 'FILE_OPS' | 'CREATE_FILE';
  description: string;
  data: any;
  callId: string;
}

interface AppState extends SystemStatus {
  battery: number;
  cpuUsage: number;
  isOnline: boolean;
  activeApp: string;
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
    battery: 92,
    isSharingScreen: false,
    cpuUsage: 4,
    isOnline: navigator.onLine,
    activeApp: 'ZAVIS Global',
    isAuthenticated: false,
    isScanningFace: false
  });

  const [history, setHistory] = useState<Transcription[]>([]);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [liveVoiceInput, setLiveVoiceInput] = useState<string>('');
  
  const [waHUD, setWaHUD] = useState({ 
    visible: false, 
    messages: [] as WhatsAppMsg[], 
    mode: 'read' as 'read' | 'send' | 'summarize',
    isProcessing: false,
    summary: ''
  });
  const [fileHUD, setFileHUD] = useState({ 
    visible: false, 
    name: '', 
    content: '', 
    cursor: 0, 
    action: 'CREATE' as 'CREATE' | 'DELETE' | 'FOLDER'
  });
  const [confirmation, setConfirmation] = useState<PendingAction | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sessionPromiseRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const transcriptionBufferRef = useRef({ user: '', assistant: '' });
  // Store active audio sources to allow stopping them on interruption
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);

  const addTerminalLine = (line: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
    setTerminalLines(prev => [...prev.slice(-10), `→ ${line}`]);
  };

  const startFaceID = async () => {
    setState(s => ({ ...s, isScanningFace: true }));
    addTerminalLine("SYS: Bio-Auth Requested");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setTimeout(() => {
        addTerminalLine("SYS: Identity Verified");
        setState(s => ({ ...s, isAuthenticated: true, isScanningFace: false }));
        if (stream) stream.getTracks().forEach(t => t.stop());
        startSession(); 
      }, 2000);
    } catch (e) {
      addTerminalLine("ERR: Sensor Link Failed");
      setState(s => ({ ...s, isScanningFace: false }));
    }
  };

  const zavisTools: FunctionDeclaration[] = [
    {
      name: 'fileSystemRobot',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ['create_file', 'create_folder', 'delete_file'] },
          path: { type: Type.STRING },
          content: { type: Type.STRING }
        },
        required: ['action', 'path']
      }
    },
    {
      name: 'whatsappEngine',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mode: { type: Type.STRING, enum: ['read', 'send', 'summarize'] },
          contact: { type: Type.STRING },
          message: { type: Type.STRING }
        },
        required: ['mode']
      }
    }
  ];

  const handleConfirmation = (choice: 'YES' | 'CANCEL') => {
    if (!confirmation) return;
    if (choice === 'YES') {
      addTerminalLine(`EXEC: ${confirmation.type}`);
      if (confirmation.type === 'CREATE_FILE') {
        setFileHUD({ visible: true, name: confirmation.data.path, content: confirmation.data.content || '', cursor: 0, action: 'CREATE' });
        let i = 0;
        const interval = setInterval(() => {
          i += 8;
          setFileHUD(h => ({ ...h, cursor: i }));
          if (i >= (confirmation.data.content?.length || 0)) {
            clearInterval(interval);
            setTimeout(() => setFileHUD(h => ({ ...h, visible: false })), 2000);
          }
        }, 30);
      }
      sessionPromiseRef.current?.then((session: any) => session.sendToolResponse({
        functionResponses: { id: confirmation.callId, name: 'confirmAction', response: { result: 'Success' } }
      }));
    }
    setConfirmation(null);
  };

  const startSession = async () => {
    try {
      addTerminalLine("ZAVIS: Global Sync Active");
      // Create a new instance right before connecting to ensure current API key usage
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction: `You are ZAVIS Global. A professional, multilingual AI system. 
          Use 'fileSystemRobot' to create or manage files. If details are missing, ask the user.
          Always confirm sensitive actions. Tone is refined, expert, and calm.`,
          tools: [{ functionDeclarations: zavisTools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setState(s => ({ ...s, isConnected: true, isListening: true }));
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            analyzerRef.current = inputAudioContextRef.current!.createAnalyser();
            const processor = inputAudioContextRef.current!.createScriptProcessor(2048, 1, 1);
            processor.onaudioprocess = (e) => {
              // Ensure we send audio data using the resolved session promise to avoid race conditions
              sessionPromiseRef.current?.then((session: any) => session.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
            };
            source.connect(analyzerRef.current);
            source.connect(processor);
            processor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              transcriptionBufferRef.current.user += text;
              setLiveVoiceInput(transcriptionBufferRef.current.user);
            }
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              transcriptionBufferRef.current.assistant += text;
            }
            if (message.serverContent?.turnComplete) {
              const { user, assistant } = transcriptionBufferRef.current;
              if (user || assistant) setHistory(p => [...p, { text: user || assistant, sender: user ? 'user' : 'assistant', timestamp: Date.now() }]);
              transcriptionBufferRef.current = { user: '', assistant: '' };
              setLiveVoiceInput('');
              setIsAITalking(false);
              setIsThinking(false);
            }

            // Handle model interruptions by stopping all queued audio
            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of audioSourcesRef.current.values()) {
                try { source.stop(); } catch(e) {}
                audioSourcesRef.current.delete(source);
              }
              nextStartTimeRef.current = 0;
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
              
              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
              });

              // Schedule playback for gapless audio
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'fileSystemRobot') {
                  setConfirmation({ id: 'f-c', type: 'CREATE_FILE', description: `Initialize ${fc.args.path}?`, data: fc.args, callId: fc.id });
                }
              }
            }
          },
          onerror: (e) => {
            console.error('Session Error:', e);
            addTerminalLine("SYS: Core Link Error");
          },
          onclose: () => {
             setState(s => ({ ...s, isConnected: false, isListening: false }));
             addTerminalLine("SYS: Session Closed");
          }
        }
      });
    } catch (e) {
      addTerminalLine("SYS: Core Link Error");
    }
  };

  return (
    <div className="min-h-screen bg-[#020202] text-slate-100 font-sans relative overflow-hidden">
      {/* Refined Ambient Background */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[180px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[180px] rounded-full"></div>
      </div>

      {!state.isAuthenticated && !state.isScanningFace ? (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <button 
            onClick={startFaceID}
            className="group relative flex flex-col items-center gap-8"
          >
            <div className="w-40 h-40 rounded-full glass border border-white/10 flex items-center justify-center transition-all duration-700 group-hover:scale-105 group-hover:border-blue-500/30 group-hover:shadow-[0_0_80px_rgba(59,130,246,0.2)]">
              <i className="fa-solid fa-fingerprint text-5xl text-blue-400 group-hover:animate-pulse"></i>
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-extrabold tracking-[0.4em] text-white">ZAVIS</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-40">Identity Authentication Required</p>
            </div>
          </button>
        </div>
      ) : state.isScanningFace ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-16">
          <div className="relative w-[32rem] h-[32rem] rounded-full overflow-hidden border border-white/5 shadow-2xl glass">
            <video ref={videoRef} className="w-full h-full object-cover grayscale brightness-110 scale-x-[-1]" />
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full animate-pulse"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle,transparent_50%,rgba(0,0,0,0.4)_100%)]"></div>
          </div>
          <p className="text-sm font-semibold tracking-[0.5em] text-blue-400 uppercase animate-pulse">Authenticating...</p>
        </div>
      ) : (
        <>
          {/* Top Global Navigation Bar */}
          <header className="fixed top-0 left-0 right-0 h-24 px-12 flex justify-between items-center z-50">
            <div className="flex items-center gap-6">
              <div className="w-10 h-10 rounded-xl glass border border-white/10 flex items-center justify-center">
                <i className="fa-solid fa-shapes text-blue-400"></i>
              </div>
              <span className="text-xs font-bold tracking-[0.3em] uppercase opacity-80">Zavis Global</span>
            </div>
            <div className="flex items-center gap-8 text-[10px] font-bold tracking-widest uppercase opacity-40">
              <div className="flex flex-col items-end">
                <span>System Load</span>
                <span className="text-blue-400 mt-0.5">{state.cpuUsage}%</span>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div className="flex flex-col items-end">
                <span>Energy</span>
                <span className="text-emerald-400 mt-0.5">{state.battery}%</span>
              </div>
            </div>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center min-h-screen pt-24">
            <div className="relative transform scale-100 transition-all duration-1000">
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
               {isThinking && (
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-64 h-64 border border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                 </div>
               )}
            </div>

            <div className="text-center mt-12 max-w-4xl px-8 z-10 transition-all duration-1000">
              <h1 className={`text-6xl font-extrabold tracking-tight transition-all duration-700 ${isAITalking ? 'text-blue-400 scale-105' : 'text-white'}`}>
                {isAITalking ? "ZAVIS" : (state.isConnected ? "At your service" : "Link Established")}
              </h1>
              <div className="mt-8 space-y-4">
                {history.slice(-1).map((h, i) => (
                   <p key={i} className={`text-2xl font-light tracking-wide transition-all ${h.sender === 'user' ? 'opacity-20 italic' : 'opacity-80'}`}>
                      {h.text}
                   </p>
                ))}
              </div>
            </div>

            {/* Voice Prompt HUD (Right Side) */}
            <div className={`fixed right-12 top-1/2 -translate-y-1/2 w-[24rem] transition-all duration-700 z-50 ${liveVoiceInput ? 'translate-x-0 opacity-100' : 'translate-x-20 opacity-0 pointer-events-none'}`}>
               <div className="glass p-12 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center gap-4 mb-6 opacity-40">
                     <i className="fa-solid fa-microphone text-blue-400 animate-pulse text-xs"></i>
                     <span className="text-[9px] font-bold uppercase tracking-[0.4em]">Live Transcription</span>
                  </div>
                  <p className="text-xl font-medium leading-relaxed text-slate-100">
                     {liveVoiceInput}
                     <span className="inline-block w-1.5 h-6 bg-blue-500/50 ml-2 animate-pulse align-middle rounded-full"></span>
                  </p>
               </div>
            </div>

            {/* System Log HUD (Left Side) */}
            <div className="fixed left-12 bottom-36 w-80 glass p-8 rounded-[2rem] border border-white/5 opacity-40 hover:opacity-100 transition-opacity duration-500">
               <h3 className="text-[9px] font-bold uppercase tracking-[0.3em] mb-6 opacity-60">System Log</h3>
               <div className="space-y-3">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="text-[10px] font-medium tracking-wide border-l border-white/10 pl-4 py-0.5 text-slate-400">
                       {line}
                    </div>
                  ))}
               </div>
            </div>

            {/* Confirmation Dialog */}
            {confirmation && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl">
                <div className="glass p-16 rounded-[3rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col items-center gap-10 max-w-lg text-center float-anim">
                  <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <i className="fa-solid fa-shield-check text-3xl text-blue-400"></i>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-[0.4em] opacity-40">Security Request</h3>
                    <p className="text-xl font-semibold">{confirmation.description}</p>
                  </div>
                  <div className="flex gap-6 w-full mt-4">
                    <button onClick={() => handleConfirmation('YES')} className="flex-1 py-5 bg-blue-600 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20">Verify</button>
                    <button onClick={() => handleConfirmation('CANCEL')} className="flex-1 py-5 bg-white/5 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-all">Dismiss</button>
                  </div>
                </div>
              </div>
            )}

            {/* Robotic Process HUD */}
            <div className={`fixed right-12 bottom-36 w-96 glass p-10 rounded-[2.5rem] border border-blue-500/20 transition-all duration-700 ${fileHUD.visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <i className="fa-solid fa-pen-nib text-blue-400"></i>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Writing: {fileHUD.name}</span>
                </div>
                <span className="text-xs font-bold tabular-nums opacity-40">{Math.floor((fileHUD.cursor / (fileHUD.content.length || 1)) * 100)}%</span>
              </div>
              <div className="bg-white/5 p-6 rounded-2xl h-32 overflow-hidden text-[11px] font-medium leading-relaxed opacity-60">
                {fileHUD.content.substring(0, fileHUD.cursor)}
                <span className="inline-block w-1.5 h-4 bg-blue-400 ml-1 animate-pulse"></span>
              </div>
            </div>
          </main>

          {/* Minimalist Global Footer */}
          <footer className="fixed bottom-0 left-0 right-0 h-32 flex items-center justify-center gap-24 z-50">
            <div className="flex items-center gap-20 glass px-16 py-6 rounded-full border border-white/5 shadow-2xl">
              <button className="text-2xl opacity-20 hover:opacity-100 transition-all hover:text-blue-400">
                <i className="fa-solid fa-paper-plane"></i>
              </button>
              
              <button 
                onClick={state.isConnected ? () => {} : startSession}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-700 ${state.isConnected ? 'bg-blue-600 shadow-[0_0_40px_rgba(59,130,246,0.4)] scale-110' : 'bg-white/10 hover:bg-white/20'}`}
              >
                <i className={`fa-solid fa-microphone-lines text-2xl transition-all ${state.isConnected ? 'text-white' : 'text-white/40'}`}></i>
              </button>

              <button className="text-2xl opacity-20 hover:opacity-100 transition-all hover:text-emerald-400">
                <i className="fa-brands fa-whatsapp"></i>
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
};

export default App;
