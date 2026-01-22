
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
    battery: 94,
    isSharingScreen: false,
    cpuUsage: 8,
    isOnline: navigator.onLine,
    activeApp: 'Windows Kernel',
    isAuthenticated: false,
    isScanningFace: false
  });

  const [history, setHistory] = useState<Transcription[]>([]);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  
  // New HUD States
  const [messageHUD, setMessageHUD] = useState({ visible: false, to: '', text: '', type: 'outgoing' as 'outgoing' | 'incoming' });
  const [mailHUD, setMailHUD] = useState({ visible: false, items: [] as any[] });
  const [fileHUD, setFileHUD] = useState({ visible: false, name: '', content: '', progress: 0 });

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sessionPromiseRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const transcriptionBufferRef = useRef({ user: '', assistant: '' });
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);

  const addTerminalLine = (line: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLines(prev => [...prev.slice(-12), `[${timestamp}] ${line}`]);
  };

  const startFaceID = async () => {
    setState(s => ({ ...s, isScanningFace: true }));
    addTerminalLine("SYS_INIT: BIOMETRIC_AUTH_REQUEST");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setTimeout(() => {
        addTerminalLine("AUTH_SUCCESS: TONMOY_IDENTIFIED [UID: 001]");
        setState(s => ({ ...s, isAuthenticated: true, isScanningFace: false }));
        if (stream) stream.getTracks().forEach(t => t.stop());
        startSession(); 
      }, 2500);
    } catch (e) {
      addTerminalLine("AUTH_ERROR: CAMERA_ACCESS_DENIED");
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
          sendMessage: {
            type: Type.OBJECT,
            properties: { to: { type: Type.STRING }, text: { type: Type.STRING } }
          }
        }
      }
    },
    {
      name: 'checkWhatsApp',
      parameters: { type: Type.OBJECT, description: 'Check for new incoming WhatsApp messages.' }
    },
    {
      name: 'readEmails',
      parameters: { type: Type.OBJECT, description: 'Scan and read recent emails from Outlook/Gmail.' }
    },
    {
      name: 'createFile',
      parameters: {
        type: Type.OBJECT,
        description: 'Create a new system file with specific content.',
        properties: {
          fileName: { type: Type.STRING },
          content: { type: Type.STRING }
        },
        required: ['fileName', 'content']
      }
    }
  ];

  const startSession = async () => {
    try {
      addTerminalLine("SYNC: CONNECTING_TO_BUMBA_CLOUD_GRID...");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are BUMBA, Tonmoy's Ultra-Fast Assistant. 
          Respond with "Yes Boss" immediately to any wake word.
          
          CAPABILITIES:
          1. WhatsApp: Check new messages (checkWhatsApp) or Send (sendMessage).
          2. Mail: Read recent emails (readEmails).
          3. System: Create files (createFile), Adjust Volume/Brightness.
          
          STYLE:
          High-tech, efficient, robotic. No long sentences. Act instantly.`,
          tools: [{ functionDeclarations: systemTools }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setState(s => ({ ...s, isConnected: true, isListening: true }));
            addTerminalLine("STATUS: BUMBA_CORE_SYNCED_AND_READY.");
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
            if (message.serverContent?.outputTranscription) {
              transcriptionBufferRef.current.assistant += message.serverContent.outputTranscription.text;
              setIsThinking(true);
            }
            
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
              setIsThinking(false);
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
                addTerminalLine(`SYNC_CMD: EXEC_${fc.name.toUpperCase()}`);
                
                if (fc.name === 'controlSystem') {
                  if (args.volume) setState(s => ({ ...s, volume: args.volume }));
                  if (args.sendMessage) {
                    setMessageHUD({ visible: true, to: args.sendMessage.to, text: args.sendMessage.text, type: 'outgoing' });
                    setTimeout(() => setMessageHUD(m => ({ ...m, visible: false })), 4000);
                  }
                }
                
                if (fc.name === 'checkWhatsApp') {
                  setMessageHUD({ visible: true, to: 'RAM', text: 'Where are the reports, Boss?', type: 'incoming' });
                  setTimeout(() => setMessageHUD(m => ({ ...m, visible: false })), 5000);
                }

                if (fc.name === 'readEmails') {
                  setMailHUD({ visible: true, items: [{ from: 'HR', subject: 'Project Alpha Update' }, { from: 'Mining Co', subject: 'Safety Audit' }] });
                  setTimeout(() => setMailHUD(h => ({ ...h, visible: false })), 6000);
                }

                if (fc.name === 'createFile') {
                  setFileHUD({ visible: true, name: args.fileName, content: args.content, progress: 0 });
                  let p = 0;
                  const interval = setInterval(() => {
                    p += 10;
                    setFileHUD(h => ({ ...h, progress: p }));
                    if (p >= 100) {
                      clearInterval(interval);
                      setTimeout(() => setFileHUD(h => ({ ...h, visible: false })), 2000);
                      addTerminalLine(`FILE_SYS: ${args.fileName} WRITTEN_SUCCESSFULLY.`);
                    }
                  }, 200);
                }

                sessionPromiseRef.current?.then((session: any) => session.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: 'Acknowledged_And_Synced' } }
                }));
              }
            }
          }
        }
      });
    } catch (e) {
      addTerminalLine("CRITICAL_ERROR: CORE_LINK_BROKEN.");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono selection:bg-blue-500/30 overflow-hidden relative">
      
      {/* Dynamic Grid Background */}
      <div className="fixed inset-0 pointer-events-none opacity-10 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10" style={{ backgroundSize: '100% 2px, 3px 100%' }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#3b82f6_0%,_transparent_70%)] opacity-30" />
      </div>

      {!state.isAuthenticated && !state.isScanningFace ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-12">
           <div className="relative group cursor-pointer" onClick={startFaceID}>
              <div className="w-56 h-56 rounded-[4rem] glass border border-blue-500/20 flex items-center justify-center shadow-[0_0_80px_rgba(59,130,246,0.15)] group-hover:scale-105 transition-all">
                <i className="fa-solid fa-robot text-8xl text-blue-500"></i>
              </div>
              <div className="absolute -inset-4 border border-blue-500/10 rounded-[4.5rem] animate-pulse"></div>
           </div>
           <div className="text-center">
              <h1 className="text-5xl font-black tracking-[1em] text-blue-400 mb-4 ml-4">BUMBA</h1>
              <p className="text-[10px] tracking-[0.4em] opacity-40 uppercase">System Lock Active - Requesting Biometrics</p>
           </div>
        </div>
      ) : state.isScanningFace ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8">
           <div className="relative w-[32rem] h-[32rem] rounded-[5rem] overflow-hidden border border-blue-500/30 shadow-[0_0_100px_rgba(59,130,246,0.2)]">
              <video ref={videoRef} className="w-full h-full object-cover grayscale brightness-125 scale-x-[-1]" />
              <div className="absolute inset-0 bg-blue-500/5 mix-blend-overlay"></div>
              <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-400 shadow-[0_0_15px_#3b82f6] animate-[scan_1.5s_infinite]"></div>
              <div className="absolute inset-10 border border-white/10 rounded-[3rem] pointer-events-none"></div>
           </div>
           <div className="flex items-center gap-4 px-8 py-3 glass rounded-full border border-blue-400/20">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
              <span className="text-xs font-black tracking-widest text-blue-400 uppercase">Analyzing Neural Signature...</span>
           </div>
        </div>
      ) : (
        <>
          <header className="fixed top-0 left-0 right-0 p-12 flex justify-between items-center z-50">
             <div className="flex items-center gap-6">
                <div className="relative">
                   <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_15px_#22c55e]"></div>
                   <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400/60">BUMBA_KERNEL_V2.9</span>
             </div>
             <div className="flex gap-12">
                <div className="flex flex-col items-end">
                   <span className="text-[9px] opacity-30 uppercase font-black mb-1 tracking-widest">CPU Load</span>
                   <span className="text-xs font-black tabular-nums">{state.cpuUsage}%</span>
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[9px] opacity-30 uppercase font-black mb-1 tracking-widest">Battery</span>
                   <span className="text-xs font-black tabular-nums">{state.battery}%</span>
                </div>
             </div>
          </header>

          <main className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="relative group mb-12 transform scale-125">
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
            </div>

            <div className="text-center max-w-5xl px-12 h-48 flex flex-col items-center justify-center">
               <h1 className="text-[5rem] font-black tracking-tighter leading-none mb-10 transition-all">
                 {isAITalking ? "BUMBA" : (state.isConnected ? "YES BOSS?" : "SYNCING")}
               </h1>
               <div className="space-y-4">
                 {history.slice(-1).map((h, i) => (
                    <p key={i} className={`text-4xl font-light tracking-tight max-w-4xl transition-all ${h.sender === 'user' ? 'text-white/20 italic' : 'text-blue-400/90'}`}>
                       {h.text}
                    </p>
                 ))}
               </div>
            </div>

            {/* SYNC TERMINAL */}
            <div className="fixed left-12 bottom-44 w-96 glass p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
               <div className="flex items-center justify-between mb-6">
                  <span className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-400">Sync Monitor</span>
                  <i className="fa-solid fa-circle-nodes text-xs opacity-20 animate-pulse"></i>
               </div>
               <div className="space-y-2 max-h-[140px] overflow-hidden">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="text-[9px] font-mono text-white/40 border-l border-white/5 pl-3 py-1 animate-fade-in whitespace-nowrap overflow-hidden text-ellipsis">
                       {line}
                    </div>
                  ))}
               </div>
            </div>

            {/* NEW MESSAGES HUD */}
            <div className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-all duration-500 ${messageHUD.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
               <div className="glass p-12 rounded-[4rem] border border-blue-500/30 shadow-2xl flex flex-col items-center gap-10 max-w-xl pointer-events-auto">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center animate-bounce ${messageHUD.type === 'incoming' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                     <i className={`fa-solid ${messageHUD.type === 'incoming' ? 'fa-comment-dots' : 'fa-paper-plane'} text-4xl`}></i>
                  </div>
                  <div className="text-center">
                     <h3 className="text-[10px] font-black uppercase tracking-[0.5em] opacity-40 mb-6">{messageHUD.type === 'incoming' ? 'Incoming WhatsApp' : 'Dispatching WhatsApp'}</h3>
                     <p className="text-xs font-black text-blue-400 mb-2 uppercase">Subject: {messageHUD.to}</p>
                     <p className="text-3xl font-light italic text-white/90">"{messageHUD.text}"</p>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500 shadow-[0_0_15px_#3b82f6] animate-[loading_4s_linear]" />
                  </div>
               </div>
            </div>

            {/* MAIL READER HUD */}
            <div className={`fixed right-12 top-48 w-96 glass p-10 rounded-[3rem] border border-white/10 transition-all duration-700 ${mailHUD.visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
               <div className="flex items-center gap-4 mb-8">
                  <i className="fa-solid fa-envelope-open-text text-blue-400"></i>
                  <span className="text-[10px] font-black uppercase tracking-widest">Inbox Synchronized</span>
               </div>
               <div className="space-y-6">
                  {mailHUD.items.map((mail, idx) => (
                    <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all">
                       <span className="text-[9px] font-black text-blue-400/60 uppercase">{mail.from}</span>
                       <p className="text-xs text-white/80 mt-1">{mail.subject}</p>
                    </div>
                  ))}
               </div>
            </div>

            {/* ROBOT FILE CREATOR HUD */}
            <div className={`fixed bottom-44 right-12 w-[30rem] glass p-10 rounded-[3rem] border border-blue-500/20 transition-all duration-700 ${fileHUD.visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}>
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                     <i className="fa-solid fa-file-code text-blue-400 animate-pulse"></i>
                     <span className="text-[10px] font-black uppercase tracking-widest">Robotic File Write: {fileHUD.name}</span>
                  </div>
                  <span className="text-xs font-black text-blue-400">{fileHUD.progress}%</span>
               </div>
               <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-6 max-h-48 overflow-hidden">
                  <pre className="text-[10px] text-green-400/60 font-mono leading-relaxed">
                     {fileHUD.content.substring(0, Math.floor((fileHUD.progress / 100) * fileHUD.content.length))}
                     <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-1"></span>
                  </pre>
               </div>
               <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${fileHUD.progress}%` }} />
               </div>
            </div>
          </main>

          <footer className="h-44 flex items-center justify-center gap-28 z-50 border-t border-white/5 bg-black/60 backdrop-blur-3xl px-20">
              <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => addTerminalLine("SYS_CHECK: MAIL_POLLING...")}>
                 <i className="fa-solid fa-envelope text-3xl opacity-20 group-hover:opacity-100 group-hover:text-blue-400 transition-all"></i>
                 <span className="text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-40">Mails</span>
              </div>
              
              <div className="relative group cursor-pointer" onClick={state.isConnected ? () => {} : startSession}>
                 <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all duration-700 ${state.isConnected ? 'bg-blue-600/20 border-blue-400/50 shadow-[0_0_100px_rgba(37,99,235,0.2)] scale-110' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}>
                    <i className={`fa-solid fa-bolt text-4xl transition-all duration-700 ${state.isConnected ? 'text-blue-400' : 'text-white/10'}`}></i>
                 </div>
              </div>

              <div className="flex flex-col items-center gap-2 group cursor-pointer" onClick={() => addTerminalLine("SYS_CHECK: WHATSAPP_SOCKET_POLLING...")}>
                 <i className="fa-brands fa-whatsapp text-4xl opacity-20 group-hover:opacity-100 group-hover:text-green-400 transition-all"></i>
                 <span className="text-[8px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-40">Chat</span>
              </div>
          </footer>
        </>
      )}

      <style>{`
        @keyframes scan { 0% { top: 0% } 100% { top: 100% } }
        @keyframes loading { from { width: 0% } to { width: 100% } }
        @keyframes fade-in { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
