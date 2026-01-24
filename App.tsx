
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Transcription } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import Visualizer from './services/Visualizer';

const App: React.FC = () => {
  const [history, setHistory] = useState<Transcription[]>([
    { text: "Open WhatsApp", sender: 'user', timestamp: Date.now() - 10000 },
    { text: "Opening WhatsApp Web", sender: 'assistant', timestamp: Date.now() - 8000 },
    { text: "Any new message?", sender: 'user', timestamp: Date.now() - 5000 },
    { text: "One new message from Rahul", sender: 'assistant', timestamp: Date.now() - 2000 }
  ]);
  const [timeline, setTimeline] = useState<string[]>([
    "Voice command received",
    "Voice command received",
    "Voice command received",
    "ZAVIS initialized"
  ]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [inputText, setInputText] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  const userTextBuffer = useRef("");
  const assistantTextBuffer = useRef("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, liveTranscript]);

  const addTimelineEvent = (event: string) => {
    setTimeline(prev => [event, ...prev.slice(0, 10)]);
  };

  const startSession = async () => {
    if (isConnected) return;
    
    addTimelineEvent("Initializing High-Speed Neural Link...");
    
    try {
      if (!process.env.API_KEY) {
        if (window.aistudio) await window.aistudio.openSelectKey();
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
          systemInstruction: `You are ZAVIS (Zero-latency AI Virtual Intelligent System).
          TONE: Professional, snappier, human-like assistant.
          MISSION: Execute commands on Tonmoy's laptop instantly.
          WAKE WORD: Your name is Bumba. Respond immediately when called.
          BEHAVIOR: Be very brief. Use Hinglish if appropriate.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            addTimelineEvent("Sync Status: 100% Verified");
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) {
              const text = msg.serverContent.inputTranscription.text;
              userTextBuffer.current += text;
              setLiveTranscript(userTextBuffer.current);
              setIsThinking(true);
            }

            if (msg.serverContent?.outputTranscription) {
              assistantTextBuffer.current += msg.serverContent.outputTranscription.text;
            }

            if (msg.serverContent?.modelTurn) {
              setIsAITalking(true);
              setIsThinking(false);
              addTimelineEvent("Voice command received");
            }

            if (msg.serverContent?.interrupted) {
              for (const source of audioSourcesRef.current) {
                try { source.stop(); } catch(e) {}
              }
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAITalking(false);
              assistantTextBuffer.current = "";
              addTimelineEvent("Session Interrupted: Sync Resuming...");
            }

            if (msg.serverContent?.turnComplete) {
              if (userTextBuffer.current || assistantTextBuffer.current) {
                setHistory(prev => [
                  ...prev,
                  ...(userTextBuffer.current ? [{ text: userTextBuffer.current, sender: 'user' as const, timestamp: Date.now() }] : []),
                  ...(assistantTextBuffer.current ? [{ text: assistantTextBuffer.current, sender: 'assistant' as const, timestamp: Date.now() }] : [])
                ]);
              }
              userTextBuffer.current = "";
              assistantTextBuffer.current = "";
              setLiveTranscript("");
              setIsAITalking(false);
              setIsThinking(false);
            }

            const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outAudioContextRef.current) {
              const ctx = outAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onerror: () => setIsConnected(false),
          onclose: () => setIsConnected(false)
        }
      });

      sessionPromiseRef.current = sessionPromise;

      const processor = audioContextRef.current!.createScriptProcessor(512, 1, 1);
      processor.onaudioprocess = (e) => {
        sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) })).catch(() => {});
      };
      
      const source = audioContextRef.current!.createMediaStreamSource(stream);
      analyzerRef.current = audioContextRef.current!.createAnalyser();
      analyzerRef.current.fftSize = 256;
      source.connect(analyzerRef.current);
      source.connect(processor);
      processor.connect(audioContextRef.current!.destination);

    } catch (e) {
      addTimelineEvent("Initialization error: Check hardware link.");
    }
  };

  const handleRun = () => {
    if (!inputText.trim()) return;
    setHistory(p => [...p, { text: inputText, sender: 'user', timestamp: Date.now() }]);
    addTimelineEvent("Manual command received");
    setInputText("");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0b0d17]">
      {/* LEFT SIDEBAR DOCK */}
      <aside className="w-[72px] bg-[#090b14] flex flex-col items-center py-10 gap-10 border-r border-white/5 z-20">
        <i className={`fa-solid fa-microphone sidebar-icon ${isConnected ? 'active' : ''}`} onClick={startSession}></i>
        <i className="fa-solid fa-comment-dots sidebar-icon"></i>
        <i className="fa-solid fa-folder sidebar-icon"></i>
        <i className="fa-solid fa-envelope sidebar-icon"></i>
        <div className="mt-auto flex flex-col gap-8 items-center pb-4">
          <i className="fa-solid fa-gear sidebar-icon"></i>
          <i className="fa-solid fa-power-off sidebar-icon text-red-500/50 hover:text-red-500 transition-colors"></i>
        </div>
      </aside>

      {/* CENTER DASHBOARD AREA */}
      <main className="flex-1 flex flex-col p-10 bg-[#0b0d17] relative">
        <header className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-widest text-white uppercase">ZAVIS</h1>
            <p className="text-[#3b82f6] text-xs font-bold uppercase tracking-widest mt-1">
              Tonmoy's Assistance AI • Cognitive Personal AI
            </p>
            <p className="text-[10px] text-slate-600 mt-1 font-bold uppercase tracking-[0.2em]">Developed by Tonmoy Das (Bumba)</p>
          </div>
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          </div>
        </header>

        <section className="grid grid-cols-12 gap-8 flex-1 mb-8">
          {/* NEURAL CORE */}
          <div className="col-span-4 zavis-panel flex flex-col items-center justify-center p-8 text-center group">
            <div className="scale-75 mb-[-140px] mt-[-120px]">
              <Visualizer 
                isActive={isConnected} 
                isAITalking={isAITalking || isThinking} 
                analyzer={analyzerRef.current || undefined} 
                volume={80} brightness={100} battery={98} isSharingScreen={false} cpuUsage={14} isOnline={true}
              />
            </div>
            <div className="z-10 mt-4">
              <h3 className="text-sm font-black text-white/40 uppercase tracking-[0.4em] mb-4">Neural Core</h3>
              <button 
                onClick={startSession}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/40 transition-all hover:scale-105 active:scale-95"
              >
                {isConnected ? 'Active' : 'Speak'}
              </button>
            </div>
          </div>

          {/* AWARENESS */}
          <div className="col-span-4 zavis-panel p-10">
            <h3 className="text-sm font-black text-white/40 uppercase tracking-[0.4em] mb-8">Awareness</h3>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className={`w-2.5 h-2.5 rounded-full ${isThinking ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-700'} transition-colors`}></span>
                <span className="text-xs font-bold text-slate-300">Processing command...</span>
              </div>
              <div className="flex items-center gap-4">
                <i className="fa-regular fa-circle-check text-emerald-500 text-sm"></i>
                <span className="text-xs font-bold text-slate-300">Mic granted</span>
              </div>
              <div className="flex items-center gap-4">
                <i className="fa-regular fa-circle-check text-emerald-500 text-sm"></i>
                <span className="text-xs font-bold text-slate-300">Files granted</span>
              </div>
              <div className="flex items-center gap-4">
                <i className="fa-solid fa-circle-info text-yellow-500 text-sm"></i>
                <span className="text-xs font-bold text-slate-300">Messaging: Ask</span>
              </div>
            </div>
          </div>

          {/* TIMELINE */}
          <div className="col-span-4 zavis-panel p-10 flex flex-col overflow-hidden">
            <h3 className="text-sm font-black text-white/40 uppercase tracking-[0.4em] mb-8 flex items-center gap-3">
              <i className="fa-solid fa-wave-square text-indigo-400"></i> Timeline
            </h3>
            <div className="flex-1 overflow-y-auto custom-scroll space-y-5">
              {timeline.map((item, i) => (
                <div key={i} className={`timeline-item text-[11px] font-bold tracking-wide transition-opacity duration-500 ${i === 0 ? 'active text-indigo-300 opacity-100' : 'text-slate-500 opacity-60'}`}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* INPUT COMMAND BAR */}
        <div className="input-bar p-5 flex items-center gap-5">
          <i className={`fa-solid ${isConnected ? 'fa-microphone text-indigo-400 animate-pulse' : 'fa-terminal text-slate-600'} ml-3`}></i>
          <input 
            type="text" 
            placeholder="Speak or type a command..." 
            className="flex-1 bg-transparent border-none outline-none text-sm font-medium placeholder:text-slate-700"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          />
          <button 
            onClick={handleRun}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            Run
          </button>
        </div>
      </main>

      {/* RIGHT CONVERSATION PANEL */}
      <aside className="w-[380px] bg-[#111421] border-l border-white/5 flex flex-col p-10 z-20">
        <h3 className="text-sm font-black text-white/40 uppercase tracking-[0.4em] mb-10">Conversation</h3>
        <div className="flex-1 overflow-y-auto custom-scroll pr-3 space-y-6">
          {history.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.sender === 'user' ? 'chat-user' : 'chat-ai'} animate-in fade-in slide-in-from-right-4`}>
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/5">
                {msg.sender === 'user' ? <i className="fa-solid fa-user text-[10px] opacity-70"></i> : <i className="fa-solid fa-robot text-[10px] text-indigo-400"></i>}
              </div>
              <div className="flex-1 font-bold leading-snug">
                <span className="text-[9px] uppercase opacity-40 block mb-1 tracking-widest">{msg.sender === 'user' ? 'Tonmoy' : 'ZAVIS'}</span>
                {msg.text}
              </div>
            </div>
          ))}
          {liveTranscript && (
            <div className="chat-bubble chat-user opacity-60 italic animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <i className="fa-solid fa-wave-square text-[10px]"></i>
              </div>
              <div className="flex-1 font-bold leading-snug">{liveTranscript}</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="pt-10 border-t border-white/5 mt-auto">
          <p className="text-[10px] text-slate-700 font-black tracking-[0.2em] text-center uppercase">
            Context-aware • Permission-safe • Local-first
          </p>
        </div>
      </aside>
    </div>
  );
};

export default App;
