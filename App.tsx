
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, FunctionDeclaration, Type } from '@google/genai';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Transcription, SystemStatus } from './types';
import { decode, decodeAudioData, createBlob } from './services/audioUtils';
import Visualizer from './components/Visualizer';

interface MetricPoint {
  time: number;
  cpu: number;
  memory: number;
  network: number;
}

interface Suggestion {
  id: string;
  text: string;
  icon: string;
  type: 'action' | 'info';
}

const App: React.FC = () => {
  const [status, setStatus] = useState<SystemStatus & { 
    battery: number; 
    isSharingScreen: boolean;
    cpuUsage: number;
    memoryUsage: number;
    networkSpeed: number;
    isOnline: boolean;
    isMinimized: boolean;
    activeApp: string;
  }>({
    volume: 50,
    brightness: 80,
    theme: 'dark',
    isConnected: false,
    isListening: false,
    battery: 100,
    isSharingScreen: false,
    cpuUsage: 12,
    memoryUsage: 45,
    networkSpeed: 5,
    isOnline: navigator.onLine,
    isMinimized: false,
    activeApp: 'Desktop'
  });
  
  const [metricsHistory, setMetricsHistory] = useState<MetricPoint[]>([]);
  const [history, setHistory] = useState<Transcription[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [lastAction, setLastAction] = useState<{msg: string, icon: string} | null>(null);
  const [groundingLinks, setGroundingLinks] = useState<{title: string, uri: string}[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  const [showVolumeHUD, setShowVolumeHUD] = useState(false);
  const [showBrightnessHUD, setShowBrightnessHUD] = useState(false);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sessionPromiseRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const transcriptionBufferRef = useRef({ user: '', assistant: '' });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setStatus(s => ({ ...s, battery: Math.round(battery.level * 100) }));
        battery.addEventListener('levelchange', () => {
          setStatus(s => ({ ...s, battery: Math.round(battery.level * 100) }));
        });
      });
    }

    const updateOnlineStatus = () => setStatus(s => ({ ...s, isOnline: navigator.onLine }));
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    const metricsInterval = setInterval(() => {
      setStatus(s => {
        const baseCpu = s.isConnected ? (isAITalking || isThinking ? 65 : 15) : 5;
        const targetCpu = Math.min(100, Math.max(0, baseCpu + Math.random() * 15 - 7));
        const baseMem = 38;
        const targetMem = Math.min(100, Math.max(0, baseMem + (s.isConnected ? 12 : 0) + Math.random() * 3));
        const targetNet = s.isConnected ? Math.random() * 40 + 2 : Math.random() * 1;

        const newPoint: MetricPoint = {
          time: Date.now(),
          cpu: targetCpu,
          memory: targetMem,
          network: targetNet
        };

        setMetricsHistory(prev => [...prev, newPoint].slice(-40));

        return { 
          ...s, 
          cpuUsage: Math.round(targetCpu),
          memoryUsage: Math.round(targetMem),
          networkSpeed: parseFloat(targetNet.toFixed(1))
        };
      });
    }, 800);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(metricsInterval);
    };
  }, [isAITalking, isThinking]);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  const showAction = (msg: string, icon: string = 'fa-bolt-lightning') => {
    setLastAction({ msg, icon });
    setTimeout(() => setLastAction(null), 3000);
  };

  const addSuggestion = (text: string, icon: string = 'fa-lightbulb', type: 'action' | 'info' = 'info') => {
    setSuggestions(prev => {
      if (prev.some(s => s.text === text)) return prev;
      const id = Math.random().toString(36).substr(2, 9);
      const newSugg: Suggestion = { id, text, icon, type };
      const updated = [newSugg, ...prev].slice(0, 3);
      setTimeout(() => {
        setSuggestions(current => current.filter(s => s.id !== id));
      }, 15000);
      return updated;
    });
  };

  const systemControlTool: FunctionDeclaration = {
    name: 'controlSystem',
    parameters: {
      type: Type.OBJECT,
      description: 'Control system settings, apps, windows, and proactive suggestions.',
      properties: {
        volume: { type: Type.NUMBER, description: 'Volume 0-100' },
        brightness: { type: Type.NUMBER, description: 'Brightness 0-100' },
        openApp: { type: Type.STRING, description: 'App to open' },
        mediaControl: { type: Type.STRING, enum: ['play', 'pause', 'next', 'previous'] },
        windowControl: {
          type: Type.OBJECT,
          description: 'Control active windows on the desktop.',
          properties: {
            action: { type: Type.STRING, enum: ['minimize', 'maximize', 'close', 'switch', 'minimizeAll'] },
            target: { type: Type.STRING, description: 'The name of the application window to target (e.g., "Notepad", "Chrome")' }
          },
          required: ['action']
        }
      },
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchText.trim()) return;

    const query = searchText;
    setSearchText('');
    setIsSearchOpen(false);
    setIsThinking(true);
    setGroundingLinks([]);
    setHistory(prev => [...prev, { text: query, sender: 'user', timestamp: Date.now() }]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: query,
        config: { tools: [{ googleSearch: {} }] },
      });

      const text = response.text || "No response received.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const links = chunks.filter((chunk: any) => chunk.web).map((chunk: any) => ({
        title: chunk.web.title || 'Source',
        uri: chunk.web.uri
      }));

      setGroundingLinks(links);
      setHistory(prev => [...prev, { text, sender: 'assistant', timestamp: Date.now() }]);
    } catch (err) {
      setHistory(prev => [...prev, { text: "Protocol error.", sender: 'assistant', timestamp: Date.now() }]);
    } finally {
      setIsThinking(false);
    }
  };

  const startVision = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStatus(s => ({ ...s, isSharingScreen: true }));
        showAction("Vision Link Active", "fa-eye");
        frameIntervalRef.current = window.setInterval(() => {
          if (!videoRef.current || !canvasRef.current || !sessionPromiseRef.current) return;
          const ctx = canvasRef.current.getContext('2d');
          if (!ctx) return;
          canvasRef.current.width = 480; 
          canvasRef.current.height = (videoRef.current.videoHeight / videoRef.current.videoWidth) * 480;
          ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
          const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
          sessionPromiseRef.current.then((session: any) => session.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }));
        }, 1000);
        stream.getTracks()[0].onended = stopVision;
      }
    } catch (err) { console.error(err); }
  };

  const stopVision = () => {
    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    setStatus(s => ({ ...s, isSharingScreen: false }));
  };

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are "Tonmoy's Assistance", his global OS layer.
          
          MANDATORY RULES:
          1. If he calls you "Assistance", you MUST reply "Yes boss" immediately.
          2. When he gives a physical command (minimize, switch app, brightness), you MUST call the tool controlSystem first.
          3. Describe the change you are making (e.g., "Switching to Notepad now, boss").
          4. You are sharp, fast, and proactive.
          
          PHYSICAL ACTIONS:
          - Minimize: Shrinks the main console to an orb.
          - Switch: Changes the simulated active application.
          - Brightness/Volume: Triggers visual HUDs.`,
          tools: [{ functionDeclarations: [systemControlTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(s => ({ ...s, isConnected: true, isListening: true }));
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
            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAITalking(false);
              setIsThinking(false);
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
              setIsThinking(false);
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
                if (args.volume !== undefined) {
                  setStatus(s => ({...s, volume: args.volume}));
                  setShowVolumeHUD(true);
                  setTimeout(() => setShowVolumeHUD(false), 2000);
                }
                if (args.brightness !== undefined) {
                  setStatus(s => ({...s, brightness: args.brightness}));
                  setShowBrightnessHUD(true);
                  setTimeout(() => setShowBrightnessHUD(false), 2000);
                }
                if (args.openApp) {
                  setStatus(s => ({ ...s, activeApp: args.openApp, isMinimized: false }));
                  showAction(`Launching ${args.openApp}`, 'fa-rocket');
                }
                if (args.windowControl) {
                  const { action, target } = args.windowControl;
                  if (action === 'minimize' || action === 'minimizeAll') {
                    setStatus(s => ({ ...s, isMinimized: true }));
                    showAction("Minimizing Workspace", "fa-window-minimize");
                  }
                  if (action === 'maximize' || action === 'switch') {
                    setStatus(s => ({ ...s, isMinimized: false, activeApp: target || s.activeApp }));
                    showAction(`Focusing ${target || 'Workspace'}`, "fa-window-maximize");
                  }
                }
                sessionPromiseRef.current?.then((session: any) => session.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: { result: 'Physical action confirmed.' } }
                }));
              }
            }
          },
          onerror: () => stopSession(),
          onclose: () => setStatus(s => ({ ...s, isConnected: false, isListening: false }))
        }
      });
    } catch (err: any) { console.error(err); }
  };

  const stopSession = () => {
    sessionPromiseRef.current?.then((session: any) => session.close());
    setStatus(s => ({ ...s, isConnected: false, isListening: false }));
    setIsAITalking(false);
    setIsThinking(false);
    stopVision();
  };

  const MetricSparkline = ({ data, dataKey, color }: { data: MetricPoint[], dataKey: keyof MetricPoint, color: string }) => (
    <div className="w-14 h-6 opacity-40 group-hover:opacity-100 transition-opacity">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-1000 font-sans selection:bg-blue-500/30 overflow-hidden relative ${status.theme === 'dark' ? 'bg-[#030303] text-white' : 'bg-gray-50 text-black'}`}>
      
      {/* Global OS Desktop Layer */}
      <div className={`fixed inset-0 pointer-events-none transition-all duration-1000 -z-10 bg-gradient-to-br from-[#0a0a0c] via-[#050505] to-[#12121a]`}>
         <div className="absolute inset-0 opacity-20 transition-all duration-1000" style={{
           background: `radial-gradient(circle at 50% 50%, ${status.activeApp === 'Desktop' ? '#3b82f633' : '#a855f733'} 0%, transparent 70%)`
         }} />
         {/* Grid pattern */}
         <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      {/* Physical Hardware Brightness Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[500] bg-black transition-opacity duration-500" style={{ opacity: 1 - (status.brightness / 100) }} />

      {/* System HUDs */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[450] flex flex-col gap-4 pointer-events-none">
        <div className={`glass px-8 py-4 rounded-3xl flex items-center gap-6 border border-blue-500/30 transition-all duration-500 ${showVolumeHUD ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-12'}`}>
          <i className="fa-solid fa-volume-high text-blue-400 text-xl"></i>
          <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_15px_#3b82f6]" style={{ width: `${status.volume}%` }} />
          </div>
          <span className="text-sm font-black tabular-nums">{status.volume}%</span>
        </div>
        <div className={`glass px-8 py-4 rounded-3xl flex items-center gap-6 border border-amber-500/30 transition-all duration-500 ${showBrightnessHUD ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-12'}`}>
          <i className="fa-solid fa-sun text-amber-400 text-xl"></i>
          <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-amber-500 transition-all duration-300 shadow-[0_0_15px_#f59e0b]" style={{ width: `${status.brightness}%` }} />
          </div>
          <span className="text-sm font-black tabular-nums">{status.brightness}%</span>
        </div>
      </div>

      {/* Search Overlay */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-[600] flex items-start justify-center pt-[15vh] px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl animate-fade-in" onClick={() => setIsSearchOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white/[0.05] backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden animate-spotlight-enter">
            <form onSubmit={handleSearchSubmit} className="flex items-center p-10 gap-8">
              <i className="fa-solid fa-sparkles text-3xl text-blue-400"></i>
              <input ref={searchInputRef} type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Yes boss, how can I help?" className="flex-1 bg-transparent text-3xl font-light outline-none placeholder:text-white/10" />
            </form>
          </div>
        </div>
      )}

      {/* Taskbar / Top Island */}
      <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 transition-all duration-700 pointer-events-auto ${status.isMinimized ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}>
        <div className="glass px-10 py-4 rounded-full flex items-center gap-10 shadow-2xl border border-white/10">
          <div className="flex items-center gap-3">
             <i className="fa-solid fa-desktop text-white/30 text-xs"></i>
             <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{status.activeApp}</span>
          </div>
          <div className="w-px h-4 bg-white/10"></div>
          <div className="flex items-center gap-4">
            <i className={`fa-solid fa-battery-${status.battery > 50 ? 'full' : 'half'} text-xs ${status.battery < 20 ? 'text-red-500' : 'text-blue-400'}`}></i>
            <span className="text-xs font-black tabular-nums">{status.battery}%</span>
          </div>
          {lastAction && (
             <div className="flex items-center gap-3 animate-pulse">
                <i className={`fa-solid ${lastAction.icon} text-blue-400`}></i>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">{lastAction.msg}</span>
             </div>
          )}
        </div>
      </div>

      <main className={`flex-1 flex flex-col items-center justify-center p-6 transition-all duration-1000 ${status.isMinimized ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100 scale-100'}`}>
        <video ref={videoRef} autoPlay playsInline className="hidden" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="relative group scale-110">
          <div className={`relative cursor-pointer transition-all duration-700 ${isThinking ? 'scale-110' : 'hover:scale-105'}`} onClick={status.isConnected ? stopSession : startSession}>
            <Visualizer isActive={status.isConnected} isAITalking={isAITalking} analyzer={analyzerRef.current || undefined} volume={status.volume} brightness={status.brightness} battery={status.battery} isSharingScreen={status.isSharingScreen} cpuUsage={status.cpuUsage} isOnline={status.isOnline} />
          </div>
        </div>

        <div className="mt-16 text-center z-20 max-w-4xl px-12">
          <h1 className={`text-8xl font-black tracking-tighter transition-all duration-700 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] ${status.isConnected ? 'opacity-100' : 'opacity-10'}`}>
            {status.isConnected ? (isThinking ? "PROCEESING" : (isAITalking ? "TONMOY'S ASSISTANT" : "I'M LISTENING")) : "IDLE STATE"}
          </h1>
          <div className="mt-16 min-h-[160px] flex flex-col items-center">
            {history.slice(-1).map((h, i) => (
                <div key={i} className="animate-fade-up flex flex-col items-center gap-8">
                    <p className={`text-4xl font-light tracking-tight leading-snug max-w-3xl ${h.sender === 'user' ? 'text-white/20' : 'text-white/90 drop-shadow-xl'}`}>
                      {h.text}
                    </p>
                </div>
            ))}
          </div>
        </div>
      </main>

      {/* Floating Minimized Orb - THE PHYSICAL ORB */}
      {status.isMinimized && (
        <div className="fixed bottom-16 right-16 z-[400] animate-bounce-in">
          <div className="absolute inset-0 bg-blue-500/20 blur-[100px] animate-pulse rounded-full" />
          <div className="relative w-28 h-28 rounded-full glass border border-blue-500/50 flex flex-col items-center justify-center cursor-pointer hover:scale-110 transition-all group" onClick={() => setStatus(s => ({ ...s, isMinimized: false }))}>
             <i className="fa-solid fa-robot text-blue-400 text-3xl animate-pulse"></i>
             <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black px-4 py-2 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest">Restore OS View</div>
          </div>
        </div>
      )}

      {/* Proactive HUD */}
      <div className={`fixed bottom-40 left-0 right-0 z-40 flex flex-col items-center gap-4 transition-all duration-700 ${status.isMinimized ? 'opacity-0 translate-y-20' : 'opacity-100'}`}>
        <div className="flex flex-wrap justify-center gap-4">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="glass flex items-center gap-4 px-8 py-4 rounded-3xl border border-blue-500/20 animate-fade-up cursor-pointer hover:bg-blue-500/10 transition-all pointer-events-auto" onClick={() => {
                setHistory(prev => [...prev, { text: suggestion.text, sender: 'user', timestamp: Date.now() }]);
                setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
            }}>
              <i className={`fa-solid ${suggestion.icon} text-blue-400`}></i>
              <span className="text-xs font-black uppercase tracking-widest">{suggestion.text}</span>
            </div>
          ))}
        </div>
      </div>

      <footer className={`h-40 flex items-center justify-center gap-20 z-10 border-t border-white/5 bg-black/40 backdrop-blur-3xl px-20 transition-transform duration-1000 ${status.isMinimized ? 'translate-y-full' : 'translate-y-0'}`}>
          <div className="flex items-center gap-20">
              <i className="fa-brands fa-windows text-4xl opacity-30 hover:opacity-100 cursor-pointer transition-all hover:scale-125" onClick={() => setStatus(s => ({ ...s, activeApp: 'Start' }))}></i>
              <button onClick={() => setIsSearchOpen(true)}>
                <i className="fa-solid fa-magnifying-glass text-4xl opacity-30 hover:opacity-100 hover:scale-125 transition-all"></i>
              </button>
              
              <div className="relative group flex items-center justify-center cursor-pointer" onClick={status.isConnected ? stopSession : startSession}>
                <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center transition-all duration-700 ${status.isConnected ? 'bg-blue-600/30 border-blue-400/50 shadow-[0_0_80px_rgba(37,99,235,0.4)] scale-110 rotate-45' : 'bg-white/5 border border-white/10'}`}>
                  <i className={`fa-solid fa-bolt text-3xl transition-transform duration-700 ${status.isConnected ? 'text-blue-400 -rotate-45' : 'text-white/10'}`}></i>
                </div>
              </div>

              <i className="fa-solid fa-sliders text-4xl opacity-30 hover:opacity-100 cursor-pointer transition-all hover:scale-125" onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}></i>
              <i className="fa-solid fa-eye text-4xl opacity-30 hover:opacity-100 cursor-pointer transition-all hover:scale-125" onClick={startVision}></i>
          </div>
      </footer>

      <style>{`
        @keyframes spotlight-enter {
          from { opacity: 0; transform: translateY(-80px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(60px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-spotlight-enter { animation: spotlight-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-up { animation: fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-bounce-in { animation: bounce-in 0.6s cubic-bezier(0.17, 0.67, 0.83, 0.67) forwards; }
      `}</style>
    </div>
  );
};

export default App;
