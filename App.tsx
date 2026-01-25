import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration, GenerateContentResponse } from '@google/genai';
import { Transcription, Task } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import { select, mean, lineRadial, curveBasisClosed } from 'd3';

type ViewMode = 'dashboard' | 'tasks' | 'advanced-chat';
type Expression = 'neutral' | 'happy' | 'thinking' | 'listening' | 'alert' | 'pro-processing';

const NeuralVisualizer: React.FC<{ isActive: boolean; isAITalking: boolean; level: number }> = ({ isActive, isAITalking, level }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const width = 500;
    const height = 500;
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'core-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', 10).attr('result', 'blur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const group = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);

    const colors = isAITalking ? ['#f59e0b', '#78350f'] : ['#3b82f6', '#1e3a8a'];
    const blobs = [0, 1, 2].map((_, i) => {
      const gradId = `grad-${i}`;
      const grad = defs.append('radialGradient').attr('id', gradId);
      grad.append('stop').attr('offset', '0%').attr('stop-color', colors[0]).attr('stop-opacity', 0.6);
      grad.append('stop').attr('offset', '100%').attr('stop-color', colors[1]).attr('stop-opacity', 0);
      return group.append('path').attr('fill', `url(#${gradId})`).attr('filter', 'url(#core-glow)').attr('opacity', 0.4);
    });

    const line = lineRadial<number>().curve(curveBasisClosed);
    let animationId: number;

    const render = () => {
      const time = Date.now() / 1000;
      blobs.forEach((blob, i) => {
        const points: number[] = [];
        const numPoints = 20;
        const baseRadius = 80 + (level * 100);
        for (let j = 0; j <= numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          const noise = Math.sin(time * 2 + j * 0.5 + i) * (15 + level * 50);
          points.push(baseRadius + noise);
        }
        blob.attr('d', line(points as any));
        blob.attr('transform', `rotate(${time * (5 + i * 2) * (i % 2 === 0 ? 1 : -1)})`);
      });
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isAITalking, level]);

  return <svg ref={svgRef} width="500" height="500" className="opacity-80" />;
};

const DigitalWatch: React.FC = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const ist = time.toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="flex flex-col items-center mt-2">
      <div className="flex items-center gap-4">
        <span className="text-3xl font-mono font-bold text-amber-500 tracking-[0.3em] drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">{ist}</span>
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
      </div>
      <span className="text-[10px] font-black text-stone-500 tracking-[0.5em] uppercase mt-1">IST Kolkata</span>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>('dashboard');
  const [history, setHistory] = useState<Transcription[]>([]);
  const [timeline, setTimeline] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAITalking, setIsAITalking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [expression, setExpression] = useState<Expression>('neutral');
  const [liveTranscript, setLiveTranscript] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [isTurbo, setIsTurbo] = useState(true);

  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    addTimelineEvent("SYSTEM_STABLE");
    setHistory([{ text: "Neural Link Standby. Awaiting Boss's Command.", sender: 'assistant', timestamp: Date.now() }]);
  }, []);

  const addTimelineEvent = (event: string) => {
    const time = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false });
    setTimeline(prev => [`${time} > ${event}`, ...prev.slice(0, 20)]);
  };

  const startSession = async () => {
    if (isConnected) return;
    addTimelineEvent("INIT_VOICE_CORE");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `SYSTEM PROTOCOL:
          You are Myra, Tonmoy's (Boss) high-speed interface.
          URGENCY: Respond with near-zero latency.
          PERSONALITY: Human-like, brief, technical, and snappy.
          Avoid conversational filler. Respond like a fast command-line tool.
          Current timezone is IST (Asia/Kolkata).`,
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => { setIsConnected(true); addTimelineEvent("LINK_LIVE"); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) { setLiveTranscript(msg.serverContent.inputTranscription.text); setExpression('listening'); setIsThinking(true); }
            if (msg.serverContent?.modelTurn) { setIsAITalking(true); setIsThinking(false); setExpression('happy'); }
            if (msg.serverContent?.turnComplete) { setIsAITalking(false); setLiveTranscript(""); setExpression('neutral'); }
            const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outAudioContextRef.current) {
              const ctx = outAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
            }
          },
          onerror: () => { setIsConnected(false); addTimelineEvent("CORE_ERROR"); },
          onclose: () => { setIsConnected(false); addTimelineEvent("LINK_CLOSED"); },
        }
      });

      const audioInCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const processor = audioInCtx.createScriptProcessor(512, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0; for(let i=0; i<input.length; i++) sum += input[i]*input[i];
        setInputLevel(Math.sqrt(sum/input.length));
        sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(input) })).catch(() => {});
      };
      const source = audioInCtx.createMediaStreamSource(stream);
      source.connect(processor);
      processor.connect(audioInCtx.destination);
    } catch (e) { addTimelineEvent("MIC_DENIED"); }
  };

  const handleAdvancedChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput; setChatInput("");
    setIsThinking(true); setExpression('pro-processing');
    setHistory(prev => [...prev, { text: userMsg, sender: 'user', timestamp: Date.now() }]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const res: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: userMsg,
        config: { systemInstruction: "Be brilliant. Be concise. Be Myra.", thinkingConfig: { thinkingBudget: isTurbo ? 0 : 32768 } }
      });
      setHistory(prev => [...prev, { text: res.text || "Blocked.", sender: 'assistant', timestamp: Date.now() }]);
      addTimelineEvent("PRO_LINK_EXEC");
    } finally { setIsThinking(false); setExpression('neutral'); }
  };

  return (
    <div className="flex h-screen w-full bg-[#020202] p-6 gap-6 flex-col overflow-hidden relative">
      <header className="flex items-center justify-between px-8 py-2 z-50">
        <div className="w-[300px]">
          <div className="zavis-glass px-6 py-3 rounded-3xl border-white/5 flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-amber-500 animate-pulse' : 'bg-stone-800'}`}></div>
            <span className="text-xs font-mono font-bold text-stone-500 uppercase tracking-widest">{isConnected ? 'Link Active' : 'Standby'}</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <h1 className="unique-header select-none">Myra Assistance</h1>
          <DigitalWatch />
        </div>
        <div className="w-[300px] flex justify-end">
          <div className="zavis-glass px-6 py-3 rounded-3xl border-white/5 text-xs font-mono text-stone-600">
             V.2.5_STABLE_NODE
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden">
        <nav className="w-20 zavis-glass rounded-[3rem] flex flex-col items-center py-10 gap-10 border-white/5">
          <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center font-black text-xl shadow-2xl shadow-amber-900/40">M</div>
          <button onClick={startSession} className={`text-2xl transition-all ${isConnected ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-microphone"></i></button>
          <button onClick={() => setView('dashboard')} className={`text-2xl transition-all ${view === 'dashboard' ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-cube"></i></button>
          <button onClick={() => setView('advanced-chat')} className={`text-2xl transition-all ${view === 'advanced-chat' ? 'text-blue-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-brain"></i></button>
          <button onClick={() => setView('tasks')} className={`text-2xl transition-all ${view === 'tasks' ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-list-check"></i></button>
        </nav>

        <main className="flex-1 flex gap-6 overflow-hidden">
          {view === 'advanced-chat' ? (
            <section className="flex-1 zavis-glass rounded-[4rem] p-10 flex flex-col border-white/5">
              <div className="flex-1 overflow-y-auto custom-scroll space-y-4 pr-4 mb-6">
                {history.map((m, i) => (
                  <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-5 rounded-3xl border ${m.sender === 'user' ? 'bg-stone-900/50 border-white/5' : 'bg-blue-900/10 border-blue-500/20 text-white'}`}>
                      <p className="text-lg">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAdvancedChat} className="relative">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Query Advanced Knowledge..." className="w-full bg-black/40 border border-white/10 rounded-full px-8 py-5 text-lg outline-none focus:border-blue-500/40 transition-all"/>
                <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all"><i className="fa-solid fa-arrow-up"></i></button>
              </form>
            </section>
          ) : view === 'tasks' ? (
            <section className="flex-1 zavis-glass rounded-[4rem] p-16 border-white/5 overflow-y-auto custom-scroll">
               <h2 className="text-4xl font-black uppercase mb-10 tracking-tighter">Registry</h2>
               <div className="space-y-4">
                 {tasks.length === 0 && <p className="opacity-20 font-mono tracking-widest text-center mt-20">NO ACTIVE THREADS</p>}
               </div>
            </section>
          ) : (
            <section className="flex-1 zavis-glass rounded-[4rem] border-white/5 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <NeuralVisualizer isActive={isConnected} isAITalking={isAITalking} level={inputLevel} />
              </div>
              {liveTranscript && (
                <div className="absolute bottom-20 z-50 bg-black/80 backdrop-blur-xl px-10 py-5 rounded-[2rem] border border-white/10 text-xl font-medium max-w-[60%] text-center italic shadow-2xl">
                  {liveTranscript}
                </div>
              )}
            </section>
          )}

          <aside className="w-[350px] flex flex-col gap-6">
            <div className="h-[300px] zavis-glass rounded-[3rem] border-white/5 flex flex-col p-8 overflow-hidden relative">
               <span className="text-[10px] font-black tracking-[0.4em] text-amber-500/50 uppercase mb-6">Neural Telemetry</span>
               <div className="flex-1 overflow-y-auto custom-scroll space-y-4 font-mono text-[10px] text-stone-500">
                  {timeline.map((log, i) => <div key={i} className="flex gap-2"><span className="text-amber-500 opacity-30">>></span>{log}</div>)}
               </div>
            </div>
            <div className="flex-1 zavis-glass rounded-[3rem] border-white/5 p-8 flex flex-col">
               <span className="text-[10px] font-black tracking-[0.4em] text-stone-600 uppercase mb-4">Core Stats</span>
               <div className="space-y-6 mt-4">
                  {[ {l: 'Logic Core', v: isTurbo ? 'TURBO' : 'DEEP'}, {l: 'Audio Link', v: isConnected ? 'STABLE' : 'IDLE'}, {l: 'Neural Temp', v: '32°C'} ].map((s, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-xs text-stone-500">{s.l}</span>
                      <span className="text-xs font-bold text-amber-500">{s.v}</span>
                    </div>
                  ))}
               </div>
               <div className="mt-auto pt-6 border-t border-white/5">
                  <p className="text-[9px] leading-tight text-stone-700 uppercase font-bold text-center tracking-widest">
                    Assistant to Tonmoy Das
                  </p>
               </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;