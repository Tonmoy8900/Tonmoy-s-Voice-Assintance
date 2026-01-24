import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration, GenerateContentResponse } from '@google/genai';
import { Transcription, Task } from './types';
import { decode, decodeAudioData, createBlob } from './audioUtils';

type ViewMode = 'dashboard' | 'tasks' | 'advanced-chat';
type Expression = 'neutral' | 'happy' | 'thinking' | 'listening' | 'alert' | 'pro-processing';

/* =========================
   FUNCTION DECLARATIONS
========================= */
const createFileDeclaration: FunctionDeclaration = {
  name: 'createFile',
  parameters: {
    type: Type.OBJECT,
    description: 'Create a new file on the user\'s computer.',
    properties: {
      fileName: { type: Type.STRING, description: 'The name of the file.' },
      content: { type: Type.STRING, description: 'Content of the file.' },
    },
    required: ['fileName', 'content'],
  },
};

const addTaskDeclaration: FunctionDeclaration = {
  name: 'addTask',
  parameters: {
    type: Type.OBJECT,
    description: 'Add a new task to the user\'s to-do list.',
    properties: {
      title: { type: Type.STRING, description: 'The description of the task.' },
    },
    required: ['title'],
  },
};

const setReminderDeclaration: FunctionDeclaration = {
  name: 'setReminder',
  parameters: {
    type: Type.OBJECT,
    description: 'Set a reminder for a task at a specific time.',
    properties: {
      taskTitle: { type: Type.STRING, description: 'The title of the task to remind about.' },
      minutesFromNow: { type: Type.NUMBER, description: 'How many minutes from now to set the reminder.' },
    },
    required: ['taskTitle', 'minutesFromNow'],
  },
};

const completeTaskDeclaration: FunctionDeclaration = {
  name: 'completeTask',
  parameters: {
    type: Type.OBJECT,
    description: 'Mark a task as completed.',
    properties: {
      identifier: { type: Type.STRING, description: 'The title or ID of the task.' },
    },
    required: ['identifier'],
  },
};

/* =========================
   DIGITAL WATCH COMPONENT (IST KOLKATA)
========================= */
const DigitalWatch: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const istTimeStr = time.toLocaleString("en-US", { 
    timeZone: "Asia/Kolkata", 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  const istDateStr = time.toLocaleDateString('en-GB', { 
    timeZone: "Asia/Kolkata",
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  }).toUpperCase();

  return (
    <div className="flex flex-col items-center mt-3 opacity-95">
      <div className="flex items-center gap-8">
        <div className="w-2 h-2 rounded-full bg-stone-900 border border-white/10"></div>
        <span className="text-[32px] font-mono font-bold text-amber-500 tracking-[0.45em] leading-none drop-shadow-[0_0_15px_rgba(245,158,11,0.7)]">
          {istTimeStr}
        </span>
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,1)]"></div>
      </div>
      <div className="flex items-center gap-4 mt-3">
         <div className="h-px w-10 bg-gradient-to-r from-transparent to-stone-700"></div>
         <span className="text-[12px] font-black text-stone-500 tracking-[0.7em] uppercase">
           {istDateStr} • IST
         </span>
         <div className="h-px w-10 bg-gradient-to-l from-transparent to-stone-700"></div>
      </div>
    </div>
  );
};

/* =========================
   STYLISH ANALOG WATCH (IST KOLKATA)
========================= */
const AnalogWatch: React.FC<{ isAlert: boolean }> = ({ isAlert }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const istTimeStr = time.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istTimeStr);

  const seconds = istDate.getSeconds();
  const minutes = istDate.getMinutes();
  const hours = istDate.getHours();

  const secRot = seconds * 6;
  const minRot = minutes * 6 + seconds * 0.1;
  const hrRot = (hours % 12) * 30 + minutes * 0.5;

  const day = istDate.getDate();
  const month = istDate.toLocaleDateString('default', { month: 'short' }).toUpperCase();

  return (
    <div className={`relative w-56 h-56 rounded-full zavis-glass flex items-center justify-center transition-all duration-700 shadow-[0_0_50px_rgba(0,0,0,0.8)] border-none ${isAlert ? 'shadow-[0_0_100px_rgba(245,158,11,0.6)] scale-110' : ''}`}>
      <div className="absolute inset-0 rounded-full border border-dashed border-amber-500/10 animate-rotate opacity-30"></div>
      <div className="absolute inset-8 rounded-full bg-radial-gradient(circle, rgba(20,20,20,0.5), transparent)"></div>
      <div className="absolute inset-0 p-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="absolute w-1.5 h-4 rounded-full" style={{ left: '50%', top: '5%', transformOrigin: '50% 500%', transform: `translateX(-50%) rotate(${i * 30}deg)`, height: i % 3 === 0 ? '16px' : '8px', backgroundColor: i % 3 === 0 ? '#f59e0b' : '#333', boxShadow: i % 3 === 0 ? '0 0 10px rgba(245, 158, 11, 0.4)' : 'none' }} />
        ))}
      </div>
      <div className="absolute right-10 top-1/2 -translate-y-1/2 flex flex-col items-center bg-[#0a0a0a]/90 border border-white/5 px-3 py-1.5 rounded-xl z-0 shadow-2xl backdrop-blur-3xl">
          <span className="text-[14px] font-black text-amber-500 tracking-tighter leading-none">{day}</span>
          <span className="text-[8px] font-mono text-stone-600 tracking-[0.2em] mt-0.5">{month}</span>
      </div>
      <div className="relative w-full h-full z-20">
        <div className="absolute left-1/2 top-1/2 w-2 h-16 bg-white rounded-full shadow-2xl flex flex-col items-center" style={{ transform: `translate(-50%, -100%) rotate(${hrRot}deg)`, transformOrigin: 'bottom center' }}><div className="w-1 h-6 bg-amber-500/40 mt-1 rounded-full"></div></div>
        <div className="absolute left-1/2 top-1/2 w-1.5 h-22 bg-amber-500 rounded-full shadow-xl" style={{ transform: `translate(-50%, -100%) rotate(${minRot}deg)`, transformOrigin: 'bottom center' }}><div className="w-0.5 h-10 bg-white/20 mx-auto mt-1 rounded-full"></div></div>
        <div className="absolute left-1/2 top-1/2 w-0.5 h-26 bg-red-600 rounded-full flex flex-col items-center" style={{ transform: `translate(-50%, -100%) rotate(${secRot}deg)`, transformOrigin: 'bottom center' }}><div className="absolute -bottom-6 w-1 h-6 bg-red-600/20 rounded-full"></div></div>
        <div className="absolute left-1/2 top-1/2 w-4 h-4 bg-stone-950 border-2 border-amber-500 rounded-full -translate-x-1/2 -translate-y-1/2 z-30 shadow-[0_0_15px_rgba(245,158,11,0.8)]" />
      </div>
      <div className="absolute bottom-10 opacity-40 pointer-events-none flex flex-col items-center">
         <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.6em] mb-1">IST KOLKATA</p>
         <div className="w-8 h-[1px] bg-stone-800"></div>
      </div>
    </div>
  );
};

const TalkingDoll: React.FC<{ expression: Expression; isTalking: boolean; inputLevel: number }> = ({ expression, isTalking, inputLevel }) => {
  const getEyeOffset = () => {
    switch (expression) {
      case 'thinking': return { x: 4, y: -6 };
      case 'listening': return { x: 0, y: -3 };
      case 'pro-processing': return { x: 0, y: 0 };
      case 'happy': return { x: 0, y: 0 };
      case 'alert': return { x: 0, y: -8 };
      default: return { x: 0, y: 0 };
    }
  };

  const eyeOffset = getEyeOffset();

  return (
    <div className="relative w-full h-full flex items-center justify-center doll-presence select-none overflow-hidden rounded-[5rem]">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[#050505] opacity-95"></div>
        <svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bokeh-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={expression === 'pro-processing' ? '#3b82f6' : '#f59e0b'} stopOpacity="0.5" />
              <stop offset="100%" stopColor={expression === 'pro-processing' ? '#3b82f6' : '#f59e0b'} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="500" cy="500" r={400 + inputLevel * 100} stroke={expression === 'pro-processing' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.08)'} strokeWidth="1" />
          <circle cx="500" cy="500" r={450 + inputLevel * 150} stroke={expression === 'pro-processing' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(245, 158, 11, 0.03)'} strokeWidth="1" className="animate-rotate" />
          {[1,2,3,4,5,6].map(i => (
            <circle key={i} cx={150 + i * 140} cy={100 + i * 160} r={40 + i * 12} fill="url(#bokeh-grad)" className="animate-pulse" style={{ animationDelay: `${i * 0.4}s` }} opacity="0.3" />
          ))}
        </svg>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
         <div className={`w-[550px] h-[550px] border rounded-full transition-all duration-1000 ${isTalking || inputLevel > 0.1 ? 'border-amber-500/30 scale-105 opacity-100' : 'border-white/5 scale-100 opacity-30'}`}></div>
         <div className={`absolute w-[600px] h-[600px] border border-dashed rounded-full transition-all duration-1000 animate-rotate ${isTalking || inputLevel > 0.1 ? 'border-amber-500/20 opacity-50' : 'border-white/0 opacity-0'}`}></div>
      </div>

      <svg width="100%" height="95%" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet" fill="none" xmlns="http://www.w3.org/2000/svg" className="z-20 drop-shadow-[0_0_80px_rgba(0,0,0,0.9)]">
        <defs>
          <linearGradient id="hair-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#854d0e" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>
          <linearGradient id="cap-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={expression === 'pro-processing' ? '#1e40af' : '#334155'} />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>
        <g transform="translate(0, 430)">
            <path d="M110 0 C70 15 50 70 50 170 L350 170 C350 70 330 15 290 0 Z" fill="#1e293b" />
            <path d="M165 0 L200 55 L235 0" fill="#991b1b" />
        </g>
        <path d="M90 200 Q70 350 110 500 M310 200 Q330 350 290 500" stroke="url(#hair-shade)" strokeWidth="60" strokeLinecap="round" />
        <g className={isTalking ? 'head-bob' : ''} style={{ transformOrigin: '200px 220px', transition: 'transform 0.4s ease-out', transform: `scale(${1 + inputLevel * 0.05})` }}>
            <path d="M125 140 Q125 85 200 85 Q275 85 275 140 L275 225 Q275 305 200 305 Q125 305 125 225 Z" fill="#ffedd5" />
            <path d="M185 295 L185 345 Q200 365 215 345 L215 295 Z" fill="#fed7aa" />
            <g className="eye-blink">
                <g transform="translate(165, 190)">
                    <circle r="22" fill="white" />
                    <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: 'transform 0.5s ease' }}>
                      <circle r="14" fill={expression === 'alert' ? '#b91c1c' : expression === 'pro-processing' ? '#3b82f6' : '#1e40af'} />
                      <circle cx="6" cy="-6" r="6" fill="white" />
                    </g>
                </g>
                <g transform="translate(235, 190)">
                    <circle r="22" fill="white" />
                    <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: 'transform 0.5s ease' }}>
                      <circle r="14" fill={expression === 'alert' ? '#b91c1c' : expression === 'pro-processing' ? '#3b82f6' : '#1e40af'} />
                      <circle cx="6" cy="-6" r="6" fill="white" />
                    </g>
                </g>
            </g>
            <g stroke="#0f172a" strokeWidth="5" fill="none">
                <circle cx="165" cy="190" r="32" />
                <circle cx="235" cy="190" r="32" />
                <path d="M195 190 L205 190" strokeLinecap="round" />
            </g>
            <g transform="translate(200, 265)">
                {isTalking ? (
                    <path d="M-24 0 Q0 30 24 0 Z" fill="#7f1d1d" className="mouth-move" />
                ) : (
                    <path d={expression === 'happy' ? "M-22 -2 Q0 24 22 -2" : expression === 'alert' ? "M-18 0 L18 0" : "M-18 0 Q0 15 18 0"} stroke="#78350f" strokeWidth="4.5" fill="none" strokeLinecap="round" />
                )}
            </g>
            <g transform="translate(125, 70)">
                <path d="M0 75 Q0 0 75 0 Q150 0 150 75 Z" fill="url(#cap-grad)" />
                <path d="M0 75 Q75 105 150 75 L155 65 Q75 95 -5 65 Z" fill="#0f172a" />
            </g>
            <path d="M125 150 Q100 240 130 380 M275 150 Q300 240 270 380" stroke="url(#hair-shade)" strokeWidth="30" strokeLinecap="round" opacity="0.95" />
        </g>
      </svg>
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
  const [activeNotification, setActiveNotification] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [isAdvancedLoading, setIsAdvancedLoading] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setHistory([{ text: "Neural Stream Online. Myra reporting for duty.", sender: 'assistant', timestamp: Date.now() }]);
    addTimelineEvent("PROTOCOL_INITIATED");
    setTasks([
      { id: '1', title: 'Review morning telemetry', completed: true, timestamp: Date.now() },
      { id: '2', title: 'Optimize neural pathways', completed: false, timestamp: Date.now() }
    ]);

    const interval = setInterval(() => {
      const now = Date.now();
      setTasks(currentTasks => {
        const dueTask = currentTasks.find(t => !t.completed && t.reminderAt && t.reminderAt <= now);
        if (dueTask) {
          triggerReminder(dueTask);
          return currentTasks.map(t => t.id === dueTask.id ? { ...t, reminderAt: undefined } : t);
        }
        return currentTasks;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const triggerReminder = (task: Task) => {
    setActiveNotification(`REMINDER: ${task.title}`);
    setExpression('alert');
    addTimelineEvent(`WATCH_REMINDER_DUE: ${task.title}`);
    setTimeout(() => {
        setActiveNotification(null);
        setExpression('neutral');
    }, 15000);
  };

  const addTimelineEvent = (event: string) => {
    setTimeline(prev => [`${new Date().toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false })} > ${event}`, ...prev.slice(0, 30)]);
  };

  const handleFunctionCall = (fc: any, sessionPromise: Promise<any>) => {
    let result = "Action executed.";
    if (fc.name === 'addTask') {
      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        title: fc.args.title,
        completed: false,
        timestamp: Date.now()
      };
      setTasks(prev => [...prev, newTask]);
      addTimelineEvent(`TASK_ADDED: ${fc.args.title}`);
      result = `Task "${fc.args.title}" added to your registry, Boss.`;
    } else if (fc.name === 'setReminder') {
      const { taskTitle, minutesFromNow } = fc.args;
      const reminderAt = Date.now() + minutesFromNow * 60000;
      setTasks(prev => {
        const exists = prev.find(t => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
        if (exists) return prev.map(t => t.id === exists.id ? { ...t, reminderAt } : t);
        return [...prev, { id: Math.random().toString(36).substr(2, 9), title: taskTitle, completed: false, timestamp: Date.now(), reminderAt }];
      });
      addTimelineEvent(`WATCH_SYNC: REMINDER_${minutesFromNow}m`);
      result = `Understood. Chronos Node synchronized for "${taskTitle}" in ${minutesFromNow} minutes.`;
    } else if (fc.name === 'completeTask') {
      const iden = fc.args.identifier.toLowerCase();
      setTasks(prev => prev.map(t => (t.id === iden || t.title.toLowerCase().includes(iden)) ? { ...t, completed: true } : t));
      addTimelineEvent(`TASK_COMPLETED: ${fc.args.identifier}`);
      result = `Objective marked as complete. Excellence achieved.`;
    }

    sessionPromise.then(s => s.sendToolResponse({
      functionResponses: { id: fc.id, name: fc.name, response: { result } }
    }));
  };

  const startSession = async () => {
    if (isConnected) return;
    addTimelineEvent("INIT_NEURAL_UPLINK");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      outAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: `You are Myra, Tonmoy's (Boss) highly responsive AI assistant.
          Your goal is to be human-like, snappy, and immediate.
          Acknowledge wake words like 'Myra' or 'Bumba' instantly.
          Be concise. Never be long-winded unless asked. 
          Use your IST-synced chronometers for time-related tasks.
          Maintain a tech-forward, efficient personality.`,
          tools: [{ functionDeclarations: [createFileDeclaration, addTaskDeclaration, completeTaskDeclaration, setReminderDeclaration] }],
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => { 
            setIsConnected(true); setExpression('happy'); addTimelineEvent("LINK_ESTABLISHED");
            const interval = setInterval(() => {
                if (canvasRef.current && videoRef.current && isConnected) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
                        canvasRef.current.toBlob((blob) => {
                            if (blob) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    const base64 = (reader.result as string).split(',')[1];
                                    sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } }));
                                };
                                reader.readAsDataURL(blob);
                            }
                        }, 'image/jpeg', 0.5);
                    }
                }
            }, 1000);
            setTimeout(() => setExpression('neutral'), 2000);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) msg.toolCall.functionCalls.forEach(fc => handleFunctionCall(fc, sessionPromise));
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
          onerror: () => { setIsConnected(false); addTimelineEvent("LINK_ERROR"); },
          onclose: () => { setIsConnected(false); addTimelineEvent("LINK_TERMINATED"); },
        }
      });

      const audioInCtx = new AudioContext({ sampleRate: 16000 });
      const processor = audioInCtx.createScriptProcessor(512, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        // Instant visual feedback for audio level
        let sum = 0;
        for(let i=0; i<input.length; i++) sum += input[i]*input[i];
        setInputLevel(Math.sqrt(sum/input.length));
        
        sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(input) })).catch(() => {});
      };
      const source = audioInCtx.createMediaStreamSource(stream);
      source.connect(processor);
      processor.connect(audioInCtx.destination);
    } catch (e) { addTimelineEvent("PERM_DENIED"); }
  };

  /* =========================
     ADVANCED CHAT (GEMINI 3 PRO)
  ========================= */
  const handleAdvancedChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAdvancedLoading) return;

    const userMsg = chatInput;
    setChatInput("");
    setIsAdvancedLoading(true);
    setExpression('pro-processing');
    setHistory(prev => [...prev, { text: userMsg, sender: 'user', timestamp: Date.now() }]);
    addTimelineEvent("PRO_CORE_INVOKED");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: userMsg,
        config: {
          systemInstruction: "You are the Knowledge Core for Tonmoy (Boss). Be brilliant, concise, and ultra-fast. No fluff.",
          thinkingConfig: { thinkingBudget: 16384 } // Reduced budget for faster response time
        }
      });

      const aiText = response.text || "Neural pathway blocked, Boss.";
      setHistory(prev => [...prev, { text: aiText, sender: 'assistant', timestamp: Date.now() }]);
      addTimelineEvent("PRO_RESPONSE_RECEIVED");
    } catch (err) {
      console.error(err);
      addTimelineEvent("PRO_CORE_FAILURE");
    } finally {
      setIsAdvancedLoading(false);
      setExpression('neutral');
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#020202] p-6 gap-6 flex-col overflow-hidden relative font-sans">
      
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} width="320" height="240" className="hidden" />

      {/* CENTERED HUD HEADER */}
      <header className="flex flex-row items-center justify-between px-10 pt-4 pb-4 z-50">
        <div className="flex items-center gap-6 w-[300px]">
            <div className="flex flex-col items-start bg-stone-950/60 px-8 py-4 rounded-[2.5rem] border border-white/5 shadow-2xl">
              <span className="text-[10px] font-black tracking-[0.3em] text-stone-600 uppercase">Core Link</span>
              <div className="flex items-center gap-5 mt-2">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-amber-500 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.7)]' : 'bg-red-900/40'}`}></div>
                  <span className={`text-[14px] font-mono font-bold uppercase tracking-widest ${expression === 'pro-processing' ? 'text-blue-500' : 'text-amber-500'}`}>{expression}</span>
              </div>
            </div>
        </div>
        <div className="flex flex-col items-center flex-1">
            <h1 className="unique-header select-none">Tonmoy's AI Assistance</h1>
            <DigitalWatch />
        </div>
        <div className="flex items-center gap-6 w-[300px] justify-end">
            <div className="flex flex-col items-end bg-stone-950/60 px-8 py-4 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <span className="text-[10px] font-black tracking-[0.3em] text-stone-600 uppercase">Neural Stream</span>
                <span className="text-[14px] font-mono font-bold text-stone-400 mt-2">[{new Date().toLocaleTimeString("en-US", {timeZone: "Asia/Kolkata", hour12: false})}]</span>
            </div>
        </div>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden mt-6">
        
        {/* SIDEBAR */}
        <nav className="w-24 zavis-glass flex flex-col items-center py-12 gap-12 rounded-[4rem] border-white/5 shadow-3xl">
          <div className="w-16 h-16 bg-amber-600 rounded-[2rem] flex items-center justify-center border border-amber-400/20 shadow-3xl shadow-amber-950/60">
            <span className="text-white font-black text-3xl">M</span>
          </div>
          <div className="flex flex-col gap-12 text-stone-600">
            <button onClick={startSession} className={`transition-all duration-300 hover:text-white ${isConnected ? 'text-amber-500 scale-125' : ''}`}><i className="fa-solid fa-microphone-lines text-3xl"></i></button>
            <button onClick={() => setView('advanced-chat')} className={`transition-all duration-300 hover:text-white ${view === 'advanced-chat' ? 'text-blue-500 scale-125' : ''}`}><i className="fa-solid fa-brain text-3xl"></i></button>
            <button onClick={() => setView('tasks')} className={`transition-all duration-300 hover:text-white ${view === 'tasks' ? 'text-amber-500 scale-125' : ''}`}><i className="fa-solid fa-list-check text-3xl"></i></button>
            <button onClick={() => setView('dashboard')} className={`transition-all duration-300 hover:text-white ${view === 'dashboard' ? 'text-amber-400 scale-125' : ''}`}><i className="fa-solid fa-cube text-3xl"></i></button>
          </div>
        </nav>

        {/* MAIN STAGE */}
        <main className="flex-1 flex relative gap-6">
          
          {view === 'advanced-chat' ? (
            <section className="flex-1 zavis-glass rounded-[5rem] p-12 flex flex-col overflow-hidden border-white/5 shadow-3xl">
                <div className="mb-8 flex items-center justify-between">
                   <div>
                     <h2 className="text-5xl font-black text-white tracking-tighter uppercase">Knowledge Core</h2>
                     <p className="text-[13px] font-mono text-blue-500 uppercase tracking-[0.6em] mt-3">Gemini 3 Pro Synchronized</p>
                   </div>
                   <div className={`px-6 py-2 rounded-full border border-blue-500/30 font-mono text-xs ${isAdvancedLoading ? 'animate-pulse text-blue-400' : 'text-blue-700'}`}>
                      {isAdvancedLoading ? 'DEEP REASONING ACTIVE' : 'SYSTEM IDLE'}
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scroll space-y-6 pr-6 mb-8">
                   {history.map((msg, i) => (
                     <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-6 rounded-[2.5rem] border ${msg.sender === 'user' ? 'bg-stone-900/40 border-white/5 rounded-br-none' : 'bg-blue-900/10 border-blue-500/20 rounded-bl-none shadow-[0_0_30px_rgba(59,130,246,0.05)]'}`}>
                           <p className={`text-lg leading-relaxed ${msg.sender === 'user' ? 'text-stone-300' : 'text-white'}`}>{msg.text}</p>
                           <span className="text-[9px] font-mono opacity-30 mt-3 block">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                        </div>
                     </div>
                   ))}
                </div>

                <form onSubmit={handleAdvancedChat} className="relative">
                   <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Access Advanced Brain..."
                      className="w-full bg-[#080808] border border-white/10 rounded-[3rem] px-10 py-6 text-xl text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-stone-700"
                   />
                   <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all shadow-xl">
                      <i className={`fa-solid ${isAdvancedLoading ? 'fa-spinner animate-spin' : 'fa-arrow-up'}`}></i>
                   </button>
                </form>
            </section>
          ) : view === 'tasks' ? (
            <section className="flex-1 zavis-glass rounded-[5rem] p-20 flex flex-col overflow-hidden border-white/5 shadow-3xl">
                <div className="mb-14">
                   <h2 className="text-5xl font-black text-white tracking-tighter uppercase">Neural Registry</h2>
                   <p className="text-[13px] font-mono text-amber-500/70 uppercase tracking-[0.6em] mt-3">Active Objective Threads</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scroll space-y-5 pr-6">
                   {tasks.length === 0 ? (
                     <div className="h-full flex items-center justify-center opacity-10"><p className="font-mono text-xl uppercase tracking-[1em]">Link Idle</p></div>
                   ) : (
                     tasks.map((task) => (
                       <div key={task.id} className={`p-8 rounded-[3rem] border transition-all duration-500 flex items-center justify-between ${task.completed ? 'bg-stone-900/10 border-white/5 opacity-40' : 'bg-stone-950/60 border-white/10 hover:border-amber-500/40 shadow-xl'}`}>
                          <div className="flex items-center gap-8">
                             <div className={`w-4 h-4 rounded-full ${task.completed ? 'bg-stone-800' : 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]'}`}></div>
                             <div>
                                <p className={`text-2xl font-semibold ${task.completed ? 'text-stone-700 line-through' : 'text-stone-100'}`}>{task.title}</p>
                                {task.reminderAt && !task.completed && (
                                    <p className="text-[11px] font-mono text-amber-500 uppercase flex items-center gap-3 mt-2"><i className="fa-solid fa-clock text-[10px]"></i> IST {new Date(task.reminderAt).toLocaleTimeString("en-US", {timeZone: "Asia/Kolkata", hour: '2-digit', minute:'2-digit'})}</p>
                                )}
                             </div>
                          </div>
                          {!task.completed && (
                            <button onClick={() => setTasks(prev => prev.map(t => t.id === task.id ? {...t, completed: true} : t))} className="w-12 h-12 rounded-full border border-amber-500/20 flex items-center justify-center hover:bg-amber-500 hover:text-black transition-all shadow-lg"><i className="fa-solid fa-check text-lg"></i></button>
                          )}
                       </div>
                     ))
                   )}
                </div>
            </section>
          ) : (
            <section className="flex-1 zavis-glass rounded-[5rem] flex items-center justify-center overflow-hidden border-white/5 relative shadow-inner">
              {(liveTranscript || isThinking || isAITalking) && (
                <div className="absolute left-20 top-[42%] w-[320px] z-40 speech-bubble-anim">
                  <div className="zavis-glass bg-[#080808]/98 border border-white/10 p-8 rounded-[3.5rem] rounded-bl-none shadow-[0_0_80px_rgba(0,0,0,0.9)]">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,1)]"></div>
                        <p className="text-[10px] font-black text-amber-500/70 uppercase tracking-widest">Neural Link Synchronized</p>
                      </div>
                      <p className="text-[18px] font-medium text-stone-200 leading-relaxed italic">
                        {liveTranscript || (isThinking ? 'Thinking...' : 'Link Active.')}
                      </p>
                  </div>
                </div>
              )}
              <div className="w-full h-full flex items-center justify-center p-16">
                  <TalkingDoll expression={expression} isTalking={isAITalking} inputLevel={inputLevel} />
              </div>
            </section>
          )}
        </main>

        {/* RIGHT PANEL */}
        <aside className="w-[400px] flex flex-col gap-6">
           <div className="relative h-[320px] zavis-glass rounded-[4rem] border-white/5 flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-stone-950/20 to-black shadow-3xl">
              <div className="absolute inset-0 pointer-events-none opacity-20">
                 <div className="w-full h-full border-[1px] border-dashed border-amber-500/10 rounded-full animate-rotate scale-150"></div>
              </div>
              <div className="animate-float">
                  <AnalogWatch isAlert={!!activeNotification} />
              </div>
              {activeNotification && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] speech-bubble-anim z-50">
                      <div className="bg-amber-600/20 border border-amber-500/80 backdrop-blur-3xl px-6 py-3 rounded-3xl shadow-3xl">
                          <p className="text-[12px] font-black text-amber-500 text-center truncate tracking-[0.2em]">{activeNotification.replace('REMINDER: ', '')}</p>
                      </div>
                  </div>
              )}
           </div>
           <div className="flex-1 zavis-glass rounded-[4rem] p-10 flex flex-col border-white/5 shadow-3xl">
              <p className="text-[11px] font-black text-amber-500 tracking-[1em] uppercase mb-10 text-center">Neural Telemetry</p>
              <div className="flex-1 overflow-y-auto custom-scroll space-y-5 font-mono text-[11px] text-stone-600">
                 {timeline.map((log, i) => (
                   <div key={i} className="flex gap-4 hover:bg-white/5 p-2 rounded-xl transition-all group border border-transparent hover:border-white/5">
                     <span className="text-amber-500/20 group-hover:text-amber-500/70 font-bold tracking-tighter">>>></span>
                     <span className="group-hover:text-stone-300 truncate tracking-tight">{log}</span>
                   </div>
                 ))}
              </div>
           </div>
        </aside>
      </div>

      <footer className="h-12 flex items-center justify-center mt-4 border-t border-white/5 pt-2">
         <p className="text-[12px] font-bold uppercase tracking-[0.6em] text-stone-800 select-none">
            Project Engineered by <span className="text-stone-600 hover:text-amber-500 transition-all duration-700 cursor-pointer drop-shadow-sm">Tonmoy Das (Bumba)</span>
         </p>
      </footer>
    </div>
  );
};

export default App;