import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, GenerateContentResponse } from '@google/genai';
import { Transcription, Task } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import { select, lineRadial, curveBasisClosed } from 'd3';

type ViewMode = 'dashboard' | 'tasks' | 'advanced-chat';
type Expression = 'neutral' | 'happy' | 'thinking' | 'listening' | 'alert';

const NeuralHUD: React.FC<{ isActive: boolean; isAITalking: boolean; level: number }> = ({ isActive, isAITalking, level }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const width = 500;
    const height = 500;
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'core-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', 12).attr('result', 'blur');
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
        const numPoints = 30;
        const baseRadius = 100 + (level * 150);
        for (let j = 0; j <= numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          const noise = Math.sin(time * 4 + j * 0.8 + i) * (20 + level * 80);
          points.push(baseRadius + noise);
        }
        blob.attr('d', line(points as any));
        blob.attr('transform', `rotate(${time * (5 + i * 4) * (i % 2 === 0 ? 1 : -1)})`);
      });
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isAITalking, level]);

  return <svg ref={svgRef} width="500" height="500" className="opacity-90 drop-shadow-[0_0_40px_rgba(245,158,11,0.3)]" />;
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
        <span className="text-3xl font-mono font-bold text-amber-500 tracking-[0.3em] drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]">{ist}</span>
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
      </div>
      <span className="text-[10px] font-black text-stone-600 tracking-[0.5em] uppercase mt-1">IST Kolkata</span>
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
    addTimelineEvent("KERNEL_BOOT_SUCCESS");
    setHistory([{ text: "Neural Link Established. I am Myra. How can I assist you, Boss?", sender: 'assistant', timestamp: Date.now() }]);
  }, []);

  const addTimelineEvent = (event: string) => {
    const time = new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false });
    setTimeline(prev => [`${time} > ${event}`, ...prev.slice(0, 40)]);
  };

  const handleFunctionCall = (fc: any, sessionPromise: Promise<any>) => {
    addTimelineEvent(`SYSTEM_ACTION: ${fc.name.toUpperCase()}`);
    let result = "Execution confirmed.";

    if (fc.name === 'createFile') {
      result = `VIRTUAL_DISK: Created ${fc.args.fileName} in cloud buffer. Content: ${fc.args.content.substring(0, 15)}...`;
    } else if (fc.name === 'addTask') {
      setTasks(prev => [...prev, { id: Math.random().toString(), title: fc.args.title, completed: false, timestamp: Date.now() }]);
      result = `REGISTRY: New objective added: ${fc.args.title}`;
    }

    sessionPromise.then(s => s.sendToolResponse({
      functionResponses: { id: fc.id, name: fc.name, response: { result } }
    }));
  };

  const startSession = async () => {
    if (isConnected) return;
    addTimelineEvent("INIT_VOICE_LINK");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: "You are Myra, Tonmoy's AI Assistant. You are currently in a browser environment on Windows. Respond snappy, direct, and human-like. Use Asia/Kolkata time.",
          inputAudioTranscription: {},
          tools: [{ 
            functionDeclarations: [
                { name: 'createFile', parameters: { type: Type.OBJECT, properties: { fileName: { type: Type.STRING }, content: { type: Type.STRING } } } },
                { name: 'addTask', parameters: { type: Type.OBJECT, properties: { title: { type: Type.STRING } } } }
            ] 
          }]
        },
        callbacks: {
          onopen: () => { setIsConnected(true); addTimelineEvent("UPLINK_STABLE"); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) msg.toolCall.functionCalls.forEach(fc => handleFunctionCall(fc, sessionPromise));
            if (msg.serverContent?.inputTranscription) { setLiveTranscript(msg.serverContent.inputTranscription.text); setIsThinking(true); }
            if (msg.serverContent?.modelTurn) { setIsAITalking(true); setIsThinking(false); }
            if (msg.serverContent?.turnComplete) { setIsAITalking(false); setLiveTranscript(""); }
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
          onerror: () => { setIsConnected(false); addTimelineEvent("LINK_TERMINATED_ERR"); },
          onclose: () => { setIsConnected(false); addTimelineEvent("LINK_IDLE"); },
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
    } catch (e) { addTimelineEvent("PERMISSION_DENIED_MIC"); }
  };

  const handleAdvancedChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput; setChatInput("");
    setIsThinking(true);
    setHistory(prev => [...prev, { text: userMsg, sender: 'user', timestamp: Date.now() }]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const res: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: userMsg,
        config: { systemInstruction: "Be brilliant. Be concise. Be Myra.", thinkingConfig: { thinkingBudget: isTurbo ? 0 : 32768 } }
      });
      setHistory(prev => [...prev, { text: res.text || "System logic error.", sender: 'assistant', timestamp: Date.now() }]);
      addTimelineEvent("QUANTUM_QUERY_EXEC");
    } finally { setIsThinking(false); }
  };

  return (
    <div className="flex h-screen w-full bg-[#020202] p-6 gap-6 flex-col overflow-hidden relative">
      <header className="flex items-center justify-between px-10 py-4 z-50">
        <div className="w-[350px]">
          <div className="zavis-glass px-8 py-4 rounded-[2rem] border-white/5 flex items-center gap-6 shadow-2xl">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-amber-500 animate-pulse' : 'bg-stone-800'}`}></div>
            <span className="text-[12px] font-mono font-bold text-stone-500 uppercase tracking-widest">{isConnected ? 'Uplink Active' : 'Offline'}</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <h1 className="unique-header select-none">Myra Windows Assistant</h1>
          <DigitalWatch />
        </div>
        <div className="w-[350px] flex justify-end">
          <div className="zavis-glass px-8 py-4 rounded-[2rem] border-white/5 text-[12px] font-mono font-bold text-stone-600">
             NODE_V2.5_STABLE
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden">
        <nav className="w-24 zavis-glass rounded-[4rem] flex flex-col items-center py-12 gap-12 border-white/5 shadow-2xl">
          <div className="w-14 h-14 bg-amber-600 rounded-[1.5rem] flex items-center justify-center font-black text-2xl shadow-xl border border-amber-400/20">M</div>
          <button onClick={startSession} className={`text-3xl transition-all ${isConnected ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-microphone-lines"></i></button>
          <button onClick={() => setView('dashboard')} className={`text-3xl transition-all ${view === 'dashboard' ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-cube"></i></button>
          <button onClick={() => setView('advanced-chat')} className={`text-3xl transition-all ${view === 'advanced-chat' ? 'text-blue-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-brain"></i></button>
          <button onClick={() => setView('tasks')} className={`text-3xl transition-all ${view === 'tasks' ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-list-check"></i></button>
        </nav>

        <main className="flex-1 flex gap-6 overflow-hidden">
          {view === 'advanced-chat' ? (
            <section className="flex-1 zavis-glass rounded-[4.5rem] p-12 flex flex-col border-white/5 shadow-inner">
              <div className="flex-1 overflow-y-auto custom-scroll space-y-6 pr-6 mb-8">
                {history.map((m, i) => (
                  <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-7 rounded-[2.5rem] border ${m.sender === 'user' ? 'bg-stone-900/40 border-white/5' : 'bg-blue-900/10 border-blue-500/20 text-white shadow-xl'}`}>
                      <p className="text-xl leading-relaxed">{m.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAdvancedChat} className="relative">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Neural command..." className="w-full bg-black/50 border border-white/10 rounded-[3rem] px-10 py-7 text-xl outline-none focus:border-blue-500/50 transition-all"/>
                <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-500 transition-all active:scale-90"><i className="fa-solid fa-arrow-up"></i></button>
              </form>
            </section>
          ) : view === 'tasks' ? (
            <section className="flex-1 zavis-glass rounded-[4.5rem] p-16 border-white/5 overflow-y-auto custom-scroll shadow-inner">
               <h2 className="text-5xl font-black uppercase mb-12 tracking-tighter">Registry</h2>
               <div className="space-y-6">
                 {tasks.length === 0 ? <p className="text-stone-700 font-mono tracking-widest text-center mt-32">NO ACTIVE OBJECTIVES</p> : 
                    tasks.map(t => (
                        <div key={t.id} className="p-8 rounded-[3rem] bg-stone-950/40 border border-white/5 flex items-center justify-between">
                            <span className="text-2xl font-bold">{t.title}</span>
                            <button onClick={() => setTasks(prev => prev.filter(x => x.id !== t.id))} className="text-stone-700 hover:text-red-500"><i className="fa-solid fa-trash"></i></button>
                        </div>
                    ))
                 }
               </div>
            </section>
          ) : (
            <section className="flex-1 zavis-glass rounded-[4.5rem] border-white/5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
              <NeuralHUD isActive={isConnected} isAITalking={isAITalking} level={inputLevel} />
              {liveTranscript && (
                <div className="absolute bottom-20 z-50 bg-black/90 backdrop-blur-3xl px-12 py-7 rounded-[3.5rem] border border-white/10 text-2xl font-medium max-w-[70%] text-center italic shadow-2xl">
                   "{liveTranscript}"
                </div>
              )}
            </section>
          )}

          <aside className="w-[380px] flex flex-col gap-6">
            <div className="h-[320px] zavis-glass rounded-[4rem] border-white/5 flex flex-col p-10 overflow-hidden relative shadow-2xl">
               <span className="text-[11px] font-black tracking-[0.5em] text-amber-500/50 uppercase mb-8">Telemetry Stream</span>
               <div className="flex-1 overflow-y-auto custom-scroll space-y-4 font-mono text-[11px] text-stone-600">
                  {timeline.map((log, i) => <div key={i} className="flex gap-3"><span>>></span>{log}</div>)}
               </div>
            </div>
            <div className="flex-1 zavis-glass rounded-[4rem] border-white/5 p-12 flex flex-col shadow-2xl">
               <span className="text-[11px] font-black tracking-[0.5em] text-stone-600 uppercase mb-8">System Status</span>
               <div className="space-y-8 mt-4">
                  {[ {l: 'Kernel Mode', v: 'TURBO'}, {l: 'Neural Link', v: isConnected ? 'STABLE' : 'IDLE'}, {l: 'System Temp', v: '32°C'} ].map((s, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[13px] text-stone-500">{s.l}</span>
                      <span className="text-[13px] font-black text-amber-500">{s.v}</span>
                    </div>
                  ))}
               </div>
               <div className="mt-auto pt-10 border-t border-white/5 text-center">
                  <p className="text-[10px] text-stone-800 uppercase font-black tracking-widest">Assistant to Tonmoy Das</p>
               </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;