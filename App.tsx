
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration } from '@google/genai';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import MyraAvatar from './components/MyraAvatar';
import Visualizer from './services/Visualizer';
import { SystemStatus } from './types';

// --- Types ---
interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'error' | 'tool' | 'system';
}

interface ToolLog {
  id: string;
  name: string;
  args: any;
  status: 'pending' | 'success' | 'error';
  timestamp: number;
}

const systemTools: FunctionDeclaration[] = [
  {
    name: 'open_application',
    parameters: {
      type: Type.OBJECT,
      description: 'Opens a Windows application.',
      properties: { app_name: { type: Type.STRING, description: 'Application name (e.g., notepad, chrome, explorer, cmd)' } },
      required: ['app_name']
    }
  },
  {
    name: 'create_file',
    parameters: {
      type: Type.OBJECT,
      description: 'Creates a file with specified name and content.',
      properties: {
        file_name: { type: Type.STRING, description: 'The name of the file, e.g., "notes.txt"' },
        content: { type: Type.STRING, description: 'The content to write into the file.' }
      },
      required: ['file_name', 'content']
    }
  },
  {
    name: 'create_folder',
    parameters: {
        type: Type.OBJECT,
        description: 'Creates a new folder.',
        properties: {
            folder_name: { type: Type.STRING, description: 'The name of the folder, e.g., "MyProject"' }
        },
        required: ['folder_name']
    }
  },
  {
      name: 'open_folder',
      parameters: {
          type: Type.OBJECT,
          description: 'Opens a folder in the Windows file explorer.',
          properties: {
              folder_path: { type: Type.STRING, description: 'The path to the folder, e.g., "."' }
          },
          required: ['folder_path']
      }
  },
  {
      name: 'send_whatsapp_message',
      parameters: {
          type: Type.OBJECT,
          description: 'Sends a WhatsApp message to a contact.',
          properties: {
              contact_name: { type: Type.STRING, description: 'The name of the contact as saved in WhatsApp.' },
              message: { type: Type.STRING, description: 'The message to send.' }
          },
          required: ['contact_name', 'message']
      }
  }
];

const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'online'>('idle');
  const [isTalking, setIsTalking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    volume: 80,
    brightness: 90,
    theme: 'dark',
    isConnected: true,
    isListening: false,
    isSharingScreen: false,
  });
  
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const playwrightPageRef = useRef<any>(null);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs(prev => [{ id: Math.random().toString(36).substr(2, 9), time, message, type }, ...prev.slice(0, 15)]);
  }, []);

  const handleToolCall = useCallback(async (fc: { name: string; args: any; id: string }) => {
    // These 'require' calls will work because Electron's webPreferences in main.js
    // has nodeIntegration: true and contextIsolation: false
    const { exec } = (window as any).require('child_process');
    const fs = (window as any).require('fs');
    const path = (window as any).require('path');
    const { chromium } = (window as any).require('playwright');
    const { ipcRenderer } = (window as any).require('electron');


    switch (fc.name) {
        case 'open_application':
            const app = fc.args.app_name.toLowerCase();
            const APP_COMMANDS: Record<string, string> = {
                chrome: 'start chrome',
                whatsapp: 'start whatsapp:',
                notepad: 'notepad',
                calculator: 'calc',
                explorer: 'explorer',
                cmd: 'cmd'
            };
            if (APP_COMMANDS[app]) {
                exec(APP_COMMANDS[app]);
                return { success: true, message: `Opened ${app}` };
            } else {
                throw new Error(`Application ${app} not supported.`);
            }

        case 'create_file':
            const { file_name, content } = fc.args;
            const filePath = path.resolve(file_name);
            fs.writeFileSync(filePath, content || '', 'utf8');
            return { success: true, path: filePath };

        case 'create_folder':
            const { folder_name } = fc.args;
            const folderPath = path.resolve(folder_name);
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            return { success: true, path: folderPath };

        case 'open_folder':
            const { folder_path: pathToOpen } = fc.args;
            const resolvedPath = path.resolve(pathToOpen);
            // Use 'start ""' to open correctly with explorer.exe on Windows
            exec(`start "" "${resolvedPath}"`); 
            return { success: true, path: resolvedPath };
        
        case 'send_whatsapp_message':
            const { contact_name, message } = fc.args;
            
            addLog("Opening WhatsApp...", "tool");
            if (!playwrightPageRef.current) {
                // Get Electron's user data path for persistent context
                const userDataPath = await ipcRenderer.invoke('get-app-user-data-path');
                const sessionPath = path.join(userDataPath, 'whatsapp-session');

                // Launch a persistent context for WhatsApp Web
                const context = await chromium.launchPersistentContext(sessionPath, { headless: false });
                const page = await context.newPage();
                await page.goto('https://web.whatsapp.com');
                playwrightPageRef.current = page;
                addLog("Please scan QR code if needed.", "tool");
            }

            const page = playwrightPageRef.current;
            await page.bringToFront();

            const SEARCH_BOX_SELECTOR = 'div[contenteditable="true"][data-tab="3"]'; // Selector for the search/chat list input
            const MESSAGE_BOX_SELECTOR = 'div[contenteditable="true"][data-tab="10"]'; // Selector for the message input box
            
            await page.waitForSelector(SEARCH_BOX_SELECTOR, { timeout: 120000 }); // Increased timeout for slower loads
            await page.click(SEARCH_BOX_SELECTOR);
            await page.fill(SEARCH_BOX_SELECTOR, ''); // Clear any previous text
            await page.keyboard.type(contact_name);
            await new Promise(r => setTimeout(r, 1000)); // Small delay for search results to appear
            await page.keyboard.press('Enter');

            // Wait for the message box to be visible, indicating the chat is open
            await page.waitForSelector(MESSAGE_BOX_SELECTOR);
            await page.click(MESSAGE_BOX_SELECTOR);
            await page.keyboard.type(message);
            await page.keyboard.press('Enter');
            
            return { success: true, message: `Message sent to ${contact_name}`};

        default:
            throw new Error(`Tool ${fc.name} not found.`);
    }
  }, []);

  const stopAssistant = useCallback(() => {
    setStatus('idle');
    setIsTalking(false);
    setTranscript("");
    addLog("LINK_TERMINATED", "system");
    setSystemStatus(prev => ({ ...prev, isListening: false }));
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    // No need to close the session explicitly here as onclose callback handles it.
    // If the session was stopped by user, session.close() would be called.
  }, [addLog]);

  const startAssistant = async () => {
    if (status !== 'idle') return;
    setStatus('connecting');
    addLog("INITIALIZING_NEURAL_UPLINK...", "system");
    setSystemStatus(prev => ({ ...prev, isListening: true }));

    try {
      const apiKey = process.env.API_KEY; // In Electron, process.env is directly available
      if (!apiKey) throw new Error("API Key not found in environment variables. Please set API_KEY.");

      const ai = new GoogleGenAI({ apiKey });
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const session = await ai.live.connect({ // Await the connection directly
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: "You are Myra, Tonmoy Das's witty cartoon girl assistant for his Windows laptop. Be snappy and helpful. You can open applications, create and open files/folders, and send WhatsApp messages. Use the available tools to fulfill user requests.",
          inputAudioTranscription: {},
          tools: [{ functionDeclarations: systemTools }, { googleSearch: {} }]
        },
        callbacks: {
          onopen: () => { setStatus('online'); addLog("SYNC_SUCCESSFUL", "system"); },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) setTranscript(msg.serverContent.inputTranscription.text);
            if (msg.serverContent?.modelTurn) setIsTalking(true);
            if (msg.serverContent?.turnComplete) { setIsTalking(false); setTranscript(""); }
            
            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && audioCtxRef.current) {
              const ctx = audioCtxRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => sourcesRef.current.delete(source);
              sourcesRef.current.add(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
            }

            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                addLog(`TOOL_EXEC: ${fc.name}(${JSON.stringify(fc.args)})`, "tool");
                setToolLogs(prev => [{ id: fc.id, name: fc.name, args: fc.args, status: 'pending', timestamp: Date.now() }, ...prev.slice(0, 5)]);
                
                let result: any;
                try {
                  result = await handleToolCall(fc);
                  setToolLogs(prev => prev.map(t => t.id === fc.id ? { ...t, status: 'success' } : t));
                } catch (e: any) {
                  addLog(`TOOL_ERROR: ${fc.name} - ${e.message}`, "error");
                  result = { error: e.message };
                  setToolLogs(prev => prev.map(t => t.id === fc.id ? { ...t, status: 'error' } : t));
                }

                session.sendToolResponse({ // Use the resolved session here
                  functionResponses: {
                    id: fc.id,
                    name: fc.name,
                    response: { result: JSON.stringify(result) },
                  }
                });
              }
            }
          },
          onclose: () => stopAssistant(),
          onerror: (e) => { 
            addLog(`SYNC_ERROR: ${e instanceof ErrorEvent ? e.message : String(e)}`, "error"); 
            stopAssistant(); 
          }
        }
      });
      sessionPromiseRef.current = Promise.resolve(session); // Store the resolved session in ref

      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      analyserRef.current = inCtx.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const sourceNode = inCtx.createMediaStreamSource(stream);
      const processor = inCtx.createScriptProcessor(2048, 1, 1);
      
      sourceNode.connect(analyserRef.current);
      analyserRef.current.connect(processor);
      processor.connect(inCtx.destination);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0; for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        setAudioLevel(Math.sqrt(sum / input.length));
        // Use the resolved session from the ref
        sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ media: createBlob(input) })).catch((sendErr: any) => { /* console.error("Error sending input:", sendErr); */ });
      };
      
    } catch (err: any) {
      addLog(`BOOT_FAILURE: ${err.message}`, "error");
      setStatus('idle'); // Crucial: Reset status to idle so the button reappears
      setSystemStatus(prev => ({ ...prev, isListening: false }));
      // Ensure microphone stream is stopped if an error occurs early
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(console.error);
        audioCtxRef.current = null;
      }
    }
  };

  return (
    <div className="flex h-screen w-full flex-col p-8 gap-8 relative overflow-hidden select-none text-slate-100">
      <header className="flex items-center justify-between z-30 px-4">
        <div>
          <h1 className="unique-header text-5xl font-black tracking-tighter uppercase">Myra AI</h1>
          <p className="text-[10px] font-mono opacity-50 uppercase tracking-[0.4em] mt-1">Host: Tonmoy_Das_Laptop</p>
        </div>
        <div className="glass px-6 py-3 rounded-2xl flex items-center gap-4">
          <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-indigo-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Neural Sync: {status}</span>
        </div>
      </header>

      <div className="flex-1 flex gap-8 z-20 overflow-hidden">
        <nav className="w-20 glass rounded-[3rem] flex flex-col items-center py-12 gap-8 shrink-0">
          <button 
            onClick={status === 'online' ? stopAssistant : startAssistant} 
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all ${status === 'online' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-stone-600'}`}
            aria-label={status === 'online' ? 'Stop Assistant' : 'Start Assistant'}
          >
            <i className="fa-solid fa-microphone"></i>
          </button>
          <button className="w-12 h-12 rounded-xl flex items-center justify-center text-xl text-stone-700" aria-label="Home"><i className="fa-solid fa-house"></i></button>
          <button className="w-12 h-12 rounded-xl flex items-center justify-center text-xl text-stone-700" aria-label="Settings"><i className="fa-solid fa-gear"></i></button>
        </nav>

        <main className="flex-1 flex gap-8">
          <section className="flex-1 glass rounded-[4rem] relative flex items-center justify-center overflow-hidden border-white/5 bg-indigo-500/5">
            <Visualizer
                isActive={status === 'online'}
                isAITalking={isTalking}
                analyzer={analyserRef.current ?? undefined}
                volume={systemStatus.volume}
                brightness={systemStatus.brightness}
                battery={95} // Placeholder
                isSharingScreen={systemStatus.isSharingScreen} // Placeholder
                cpuUsage={35} // Placeholder
                isOnline={systemStatus.isConnected} // Placeholder
            />
            
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <MyraAvatar isTalking={isTalking} level={audioLevel} />
            </div>
            
            {transcript && (
              <div className="absolute bottom-12 bg-black/70 backdrop-blur-3xl px-10 py-5 rounded-2xl border border-white/10 text-xl italic text-indigo-100 max-w-[70%] text-center">
                "{transcript}"
              </div>
            )}
            
            {status === 'idle' && (
              <button onClick={startAssistant} className="absolute inset-0 bg-black/20 flex items-center justify-center group">
                <div className="glass px-12 py-6 rounded-3xl border-indigo-500/30 text-indigo-400 font-bold uppercase tracking-widest group-hover:scale-110 transition-transform">Sync Assistant</div>
              </button>
            )}
            {status === 'connecting' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="flex items-center gap-4 text-indigo-300 font-bold text-lg">
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        <span>Connecting...</span>
                    </div>
                </div>
            )}
          </section>

          <aside className="w-[380px] flex flex-col gap-8">
            <div className="h-[300px] glass rounded-[3rem] p-8 overflow-hidden">
               <span className="text-[10px] font-black tracking-widest text-indigo-500 uppercase block mb-6">Neural Stream</span>
               <div className="space-y-4 font-mono text-[10px] overflow-y-auto custom-scroll h-full pb-8">
                  {logs.map(l => <div key={l.id} className="flex gap-2 opacity-80"><span className="text-stone-600">[{l.time}]</span><span>{l.message}</span></div>)}
               </div>
            </div>
            <div className="flex-1 glass rounded-[3rem] p-8">
               <span className="text-[10px] font-black tracking-widest text-stone-500 uppercase block mb-6">Action Matrix</span>
               <div className="space-y-3">
                  {toolLogs.map(tl => (
                    <div key={tl.id} className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase text-indigo-300">
                        <span>{tl.name}</span>
                        <span className={`capitalize ${tl.status === 'success' ? 'text-emerald-500' : tl.status === 'error' ? 'text-red-500' : 'text-yellow-500'}`}>{tl.status}</span>
                      </div>
                    </div>
                  ))}
                  {toolLogs.length === 0 && <p className="text-[10px] text-stone-600 italic">No tasks executed.</p>}
               </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;