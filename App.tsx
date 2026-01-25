import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Transcription, Task } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import { select, lineRadial, curveBasisClosed } from 'd3';

const NeuralCore: React.FC<{ isActive: boolean; isTalking: boolean; level: number }> = ({ isActive, isTalking, level }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const width = 450;
    const height = 450;
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'neural-glow');
    filter.append('feGaussianBlur').attr('stdDeviation', 15).attr('result', 'blur');
    filter.append('feMerge').selectAll('feMergeNode').data(['blur', 'SourceGraphic']).enter().append('feMergeNode').attr('in', d => d);

    const group = svg.append('g').attr('transform', `translate(${width / 2}, ${height / 2})`);
    const colors = isTalking ? ['#fbbf24', '#d97706'] : ['#3b82f6', '#1e40af'];

    const blobs = [0, 1, 2].map((_, i) => {
      const gradId = `neural-grad-${i}`;
      const grad = defs.append('radialGradient').attr('id', gradId);
      grad.append('stop').attr('offset', '10%').attr('stop-color', colors[0]).attr('stop-opacity', 0.5);
      grad.append('stop').attr('offset', '100%').attr('stop-color', colors[1]).attr('stop-opacity', 0);
      return group.append('path').attr('fill', `url(#${gradId})`).attr('filter', 'url(#neural-glow)').attr('opacity', 0.6);
    });

    const line = lineRadial<number>().curve(curveBasisClosed);
    let rafId: number;

    const animate = () => {
      const t = Date.now() / 1000;
      blobs.forEach((blob, i) => {
        const points: number[] = [];
        const base = 90 + (level * 140);
        for (let j = 0; j <= 24; j++) {
          const noise = Math.sin(t * (2 + i * 0.5) + j * 0.4) * (15 + level * 60);
          points.push(base + noise);
        }
        blob.attr('d', line(points as any));
        blob.attr('transform', `rotate(${t * (8 + i * 3) * (i % 2 === 0 ? 1 : -1)})`);
      });
      rafId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(rafId);
  }, [isTalking, level]);

  return <svg ref={svgRef} width="450" height="450" className="drop-shadow-2xl" />;
};

const App: React.FC = () => {
  const [view, setView] = useState<'dash' | 'chat' | 'tasks'>('dash');
  const [connected, setConnected] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs(prev => [`${time} > ${msg}`, ...prev.slice(0, 15)]);
  };

  const initLink = async () => {
    if (connected) return;
    addLog("SYNCHRONIZING_CORE...");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: "You are Myra, an advanced AI Assistant for Tonmoy Das. You reside in his browser and provide high-fidelity vocal assistance. Be sharp, witty, and extremely helpful. You simulate full Windows integration.",
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => { setConnected(true); addLog("LINK_ESTABLISHED"); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) setTranscript(msg.serverContent.inputTranscription.text);
            if (msg.serverContent?.modelTurn) setIsTalking(true);
            if (msg.serverContent?.turnComplete) { setIsTalking(false); setTranscript(""); }
            
            const audioBase64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioBase64 && audioCtxRef.current) {
              const ctx = audioCtxRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioBase64), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
            }
          },
          onclose: () => { setConnected(false); addLog("LINK_DROPPED"); },
          onerror: (err) => { console.error(err); addLog("CORE_MALFUNCTION"); },
        }
      });

      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const processor = inCtx.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let rms = 0; for(let i=0; i<input.length; i++) rms += input[i]*input[i];
        setInputLevel(Math.sqrt(rms/input.length));
        sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(input) })).catch(() => {});
      };
      inCtx.createMediaStreamSource(stream).connect(processor);
      processor.connect(inCtx.destination);
    } catch (e) { addLog("PERMISSION_FAILURE"); }
  };

  return (
    <div className="flex h-screen w-full flex-col p-8 gap-8 relative overflow-hidden select-none">
      <header className="flex items-center justify-between px-4 z-10">
        <div className="flex flex-col">
          <h1 className="unique-header text-5xl uppercase font-black">Myra Core</h1>
          <div className="flex items-center gap-3 mt-1 opacity-50">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-[10px] font-mono font-bold tracking-[0.4em] uppercase">V-ID: DAS_TONMOY_01</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="glass px-6 py-3 rounded-full flex items-center gap-4">
             <div className={`w-2 h-2 rounded-full ${connected ? 'bg-amber-500 shadow-[0_0_10px_#f59e0b]' : 'bg-stone-800'}`}></div>
             <span className="text-[11px] font-mono font-black text-stone-400 uppercase tracking-widest">{connected ? 'Online' : 'Standby'}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-8 overflow-hidden">
        <nav className="w-24 glass rounded-[4rem] flex flex-col items-center py-12 gap-12 border-white/5 shadow-2xl">
          <button onClick={initLink} className={`text-3xl transition-all ${connected ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-microphone-lines"></i></button>
          <button onClick={() => setView('dash')} className={`text-3xl transition-all ${view === 'dash' ? 'text-amber-400 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-gauge-high"></i></button>
          <button onClick={() => setView('tasks')} className={`text-3xl transition-all ${view === 'tasks' ? 'text-amber-500 scale-125' : 'text-stone-700 hover:text-white'}`}><i className="fa-solid fa-clipboard-list"></i></button>
        </nav>

        <main className="flex-1 flex gap-8 overflow-hidden">
          <section className="flex-1 glass rounded-[5rem] border-white/5 flex items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            <NeuralCore isActive={connected} isTalking={isTalking} level={inputLevel} />
            {transcript && (
              <div className="absolute bottom-20 bg-black/80 backdrop-blur-3xl px-12 py-6 rounded-full border border-white/10 text-xl font-medium italic shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] text-amber-200">
                "{transcript}"
              </div>
            )}
          </section>

          <aside className="w-[400px] flex flex-col gap-8">
            <div className="h-[300px] glass rounded-[4rem] p-10 flex flex-col overflow-hidden">
               <span className="text-[10px] font-black tracking-[0.6em] text-amber-500 uppercase mb-8">System Telemetry</span>
               <div className="flex-1 overflow-y-auto custom-scroll space-y-4 font-mono text-[10px] text-stone-500">
                  {logs.map((l, i) => (
                    <div key={i} className="flex gap-4">
                      <span className="text-amber-500/30">❯</span>
                      <span>{l}</span>
                    </div>
                  ))}
                  {logs.length === 0 && <div className="opacity-20 italic">WAITING FOR KERNEL HOOK...</div>}
               </div>
            </div>
            <div className="flex-1 glass rounded-[4rem] p-12 flex flex-col">
               <span className="text-[10px] font-black tracking-[0.6em] text-stone-600 uppercase mb-8">Registry Stats</span>
               <div className="space-y-8 mt-4">
                  {[ 
                    {l:'Memory Use', v:'4.2 GB', p: 40}, 
                    {l:'Network', v:'120 Mbps', p: 85}, 
                    {l:'Latency', v:'32 ms', p: 15} 
                  ].map((s,i) => (
                    <div key={i} className="flex flex-col gap-3">
                      <div className="flex justify-between items-center text-[12px] font-mono uppercase">
                        <span className="text-stone-500">{s.l}</span>
                        <span className="text-amber-500 font-black">{s.v}</span>
                      </div>
                      <div className="h-1 bg-stone-900 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500/50" style={{ width: `${s.p}%` }}></div>
                      </div>
                    </div>
                  ))}
               </div>
               <div className="mt-auto pt-10 border-t border-white/5 text-center">
                 <p className="text-[10px] font-black text-stone-800 tracking-[0.3em] uppercase">Proprietary Node v1.0.4</p>
               </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;