/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions, modelConfig } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown, FileText, Search, Upload } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { MicrophoneSelector } from '../components/MicrophoneSelector';
import { DocumentUploader } from '../components/DocumentUploader';
import ragService from '../lib/ragService.js';

import './ConsolePage.scss';



/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

// Helper: Convert Int16Array audio to Blob URL
function int16ArrayToWavUrl(int16Array: Int16Array, sampleRate = 24000) {
  if (!int16Array || int16Array.length === 0) return undefined;
  // Minimal WAV header for mono PCM
  const buffer = new ArrayBuffer(44 + int16Array.length * 2);
  const view = new DataView(buffer);
  // RIFF identifier 'RIFF'
  view.setUint32(0, 0x52494646, false);
  // file length
  view.setUint32(4, 36 + int16Array.length * 2, true);
  // RIFF type 'WAVE'
  view.setUint32(8, 0x57415645, false);
  // format chunk identifier 'fmt '
  view.setUint32(12, 0x666d7420, false);
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier 'data'
  view.setUint32(36, 0x64617461, false);
  // data chunk length
  view.setUint32(40, int16Array.length * 2, true);
  // PCM samples
  for (let i = 0; i < int16Array.length; i++) {
    view.setInt16(44 + i * 2, int16Array[i], true);
  }
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [eventsCollapsed, setEventsCollapsed] = useState(false);
  const [ragStats, setRagStats] = useState<any>(null);
  const [ragInitializing, setRagInitializing] = useState(false);
  const [showDocumentUploader, setShowDocumentUploader] = useState(false);
  const [assistantWaitingForTool, setAssistantWaitingForTool] = useState(false);
  // Track if assistant audio is playing
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  // Track last user message timestamp and fallback timer
  const [lastUserMessageTime, setLastUserMessageTime] = useState<number | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ragReady, setRagReady] = useState(false);
  const [toolReady, setToolReady] = useState(false); // NEW: toolReady state
  const queuedUserMessagesRef = useRef<ItemType[]>([]);
  const toolReadyRef = useRef(false);

  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    try {
      startTimeRef.current = new Date().toISOString();
      setIsConnected(true);
      setRealtimeEvents([]);
      setItems(client.conversation.getItems());

      // 1. Connect to realtime API first
      await client.connect();

      // 2. Connect to audio output
      await wavStreamPlayer.connect();

      // 3. Connect to microphone with selected device
      await wavRecorder.begin(selectedDeviceId);

      // 4. Only now start recording if VAD mode
      if (client.getTurnDetectionType() === 'server_vad') {
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
      }
      console.log('[Connect] Connected successfully');
    } catch (err: any) {
      console.error('[Connect Error]', err);
      setIsConnected(false);
      alert('Failed to connect: ' + (err?.message || err));
    }
  }, [selectedDeviceId]);

  /**
   * Disconnect from real-time API but preserve conversation
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setRealtimeEvents([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  /**
   * Clear all conversation history and reset
   */
  const clearConversation = useCallback(async () => {
    setItems([]);
    setRealtimeEvents([]);
    
    const client = clientRef.current;
    client.reset();
  }, []);

  /**
   * Initialize RAG system
   */
  const initializeRAG = useCallback(async () => {
    setRagInitializing(true);
    try {
      const stats = await ragService.initialize();
      setRagStats(stats);
      setRagReady(true);
      console.log('RAG system ready:', stats);
      // Process any queued user messages
      if (queuedUserMessagesRef.current.length > 0) {
        queuedUserMessagesRef.current.forEach(msg => processUserMessageWithTranscript(msg));
        queuedUserMessagesRef.current = [];
      }
    } catch (error) {
      console.error('Failed to initialize RAG:', error);
    } finally {
      setRagInitializing(false);
    }
  }, []);

  // Helper: process user message with transcript
  async function processUserMessageWithTranscript(userMsg: ItemType) {
    if (!userMsg.formatted || !userMsg.formatted.transcript || userMsg.formatted.transcript.trim() === '') {
      console.log('[Assistant] Skipping user message without transcript (processUserMessageWithTranscript).');
      return;
    }
    // REMOVED: Blocking check for ragReady/toolReady and queuing logic
    // Always process the user message immediately
    console.log('[Assistant] Processing user message with transcript:', userMsg.formatted.transcript);
    try {
      const results = await ragService.searchDocuments(userMsg.formatted.transcript, 5);
      console.log('[Tool Handler] searchDocuments results:', results);
      let answer = '';
      if (results.length === 0) {
        answer = 'No relevant documents found for your query.';
        setItems(prev => ([
          ...prev,
          {
            id: `assistant-auto-${Date.now()}`,
            role: 'assistant',
            status: 'completed',
            formatted: { text: answer },
            created_at: Date.now(),
          } as unknown as ItemType
        ]));
        console.log('[Assistant] Appended assistant reply:', answer);
        return;
      }
      // Compose a RAG-augmented system message and user message
      const documentContext = results.map((result, index) => `Result ${index + 1} (${result.source}):\n${result.content}`).join('\n\n');
      const systemPrompt = `Using the following document context, answer the user's question as helpfully and conversationally as possible.\n\nUser question: ${userMsg.formatted.transcript}\n\nDocument context:\n${documentContext}`;
      console.log('[Assistant] Sending RAG-augmented system message and user message to LLM:', systemPrompt);
      // Use the Realtime API: update instructions, send user message, then restore instructions
      const client = clientRef.current;
      const originalInstructions = instructions;
      await client.updateSession({ instructions: systemPrompt });
      await client.sendUserMessageContent([{ type: 'input_text', text: userMsg.formatted.transcript }]);
      // Optionally restore the original instructions after a short delay
      setTimeout(() => {
        client.updateSession({ instructions: originalInstructions });
      }, 1000);
      // Wait for the assistant's reply (simulate streaming by polling for new items)
      let tries = 0;
      let llmReply: ItemType | undefined = undefined;
      const userMsgTime = Date.now();
      while (tries < 30 && !llmReply) {
        await new Promise(res => setTimeout(res, 500));
        const items = client.conversation.getItems();
        llmReply = items.find(i => i.role === 'assistant' && 'status' in i && i.status === 'completed' && 'created_at' in i && typeof i.created_at === 'number' && i.created_at > userMsgTime);
        tries++;
      }
      if (llmReply && llmReply.formatted && (llmReply.formatted.text || llmReply.formatted.transcript)) {
        const replyText = llmReply.formatted.text || llmReply.formatted.transcript || '';
        setItems(prev => ([
          ...prev,
          {
            id: `assistant-auto-${Date.now()}`,
            role: 'assistant',
            status: 'completed',
            formatted: { text: replyText },
            created_at: Date.now(),
          } as unknown as ItemType
        ]));
        console.log('[Assistant] Appended LLM reply:', replyText);
      } else {
        // Fallback: just append the RAG summary
        answer = documentContext.length > 400 ? documentContext.slice(0, 400) + '...' : documentContext;
        setItems(prev => ([
          ...prev,
          {
            id: `assistant-auto-${Date.now()}`,
            role: 'assistant',
            status: 'completed',
            formatted: { text: answer },
            created_at: Date.now(),
          } as unknown as ItemType
        ]));
        console.log('[Assistant] Appended fallback RAG summary:', answer);
      }
    } catch (error) {
      console.error('[Assistant] Error processing tool call or LLM:', error);
    }
  }

  // Helper: process all queued messages if both ragReady and toolReadyRef.current are true
  function processQueuedMessagesIfReady() {
    if (ragReady && toolReady && queuedUserMessagesRef.current.length > 0) {
      console.log('[Assistant] RAG and tool ready (ref), processing queued user messages:', queuedUserMessagesRef.current);
      // Only now send the queued messages
      queuedUserMessagesRef.current.forEach(msg => processUserMessageWithTranscript(msg));
      queuedUserMessagesRef.current = [];
    }
  }

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    console.log('[Voice] Recording stopped. Triggering createResponse()...');
    client.createResponse();
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription model from config
    console.log('[Session Config] Setting transcription model:', modelConfig.transcription);
    client.updateSession({ input_audio_transcription: { model: modelConfig.transcription as any } });
    // Set assistant model from config
    client.updateSession({ model: modelConfig.assistant });

    // Add RAG tool for document search (synchronously, before any user input)
    client.addTool(
      {
        name: 'search_documents',
        description: 'Search through the available documents to find relevant information to answer user questions. Use this when the user asks about specific topics, procedures, or information that might be in the documents.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant document chunks. Be specific and include key terms.',
            },
            top_k: {
              type: 'number',
              description: 'Number of most relevant chunks to retrieve (default: 5)',
              default: 5,
            },
          },
          required: ['query'],
        },
      },
      async ({ query, top_k = 5 }: { query: string; top_k?: number }) => {
        console.log('[Tool] search_documents called with:', { query, top_k });
        try {
          const results = await ragService.searchDocuments(query, top_k);
          console.log('[Tool Handler] searchDocuments results:', results);
          if (results.length === 0) {
            console.warn('[RAG] No relevant documents found for query:', query);
            return {
              status: "no_results",
              message: "No relevant documents found for your query.",
              query: query
            };
          }
          // Format the results in a way that's easy for the assistant to use
          const formattedResults = results.map((result, index) => 
            `Result ${index + 1} (${result.source}):\n${result.content}`
          ).join('\n\n');
          // Add a small delay to ensure the assistant processes the results
          await new Promise(resolve => setTimeout(resolve, 500));
          // Create a concise summary (first 2 results, 400 chars max)
          const summary = formattedResults.length > 400 ? formattedResults.slice(0, 400) + '...' : formattedResults;
          // Truncate document_content if too long (e.g., 2000 chars)
          const document_content = formattedResults.length > 2000 ? formattedResults.slice(0, 2000) + '...' : formattedResults;
          const toolResponse = {
            status: "success",
            message: `Found ${results.length} relevant document chunks for your query.`,
            query: query,
            total_results: results.length,
            document_content,
            sources: results.map(r => r.source),
            summary
          };
          console.log('[Tool Handler] Returning toolResponse:', toolResponse);
          return toolResponse;
        } catch (error) {
          console.error('RAG search error:', error);
          return {
            status: "error",
            error: 'Failed to search documents',
            message: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    );
    toolReadyRef.current = true;
    setToolReady(true); // NEW: set toolReady state
    processQueuedMessagesIfReady(); // Process queued messages after tool is ready

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      console.log('[Conversation] getItems:', items);
      console.log('[Conversation Updated] Items:', items);
      console.log('[Conversation Updated] Item:', item);
      console.log('[Conversation Updated] Event type:', item.type, 'Status:', item.status, 'Role:', item.role, 'Formatted:', item.formatted);
      // Ensure user message is present in items
      if (item.role === 'user' && !items.find((msg: ItemType) => msg.id === item.id)) {
        // Manually add the user message if missing, with transcript and playable audio
        let formatted = { ...item.formatted };
        if (item.formatted && item.formatted.audio && !item.formatted.file) {
          formatted.file = { url: int16ArrayToWavUrl(item.formatted.audio) };
        }
        setItems(prev => ([...prev, { ...item, formatted }]));
        console.log('[Conversation] Manually added user message to items:', { ...item, formatted });
      } else {
        setItems(items.map(msg => {
          if (msg.role === 'user' && msg.formatted && msg.formatted.audio && !msg.formatted.file) {
            return { ...msg, formatted: { ...msg.formatted, file: { url: int16ArrayToWavUrl(msg.formatted.audio) } } };
          }
          return msg;
        }));
      }
      // Only process user messages if transcript is available
      if (item.role === 'user' && item.formatted && item.formatted.transcript && item.formatted.transcript.trim() !== '') {
        processUserMessageWithTranscript(item);
        return;
      }
      if (item.role === 'user' && (!item.formatted || !item.formatted.transcript || item.formatted.transcript.trim() === '')) {
        console.log('[Assistant] Skipping user message without transcript.');
        return;
      }
      if (delta) {
        console.log('[Conversation Updated] Delta:', delta);
      }
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      // Check if assistant is waiting for tool response
      if (item.role === 'assistant' && item.status === 'in_progress' && item.formatted.tool && !item.formatted.output) {
        setAssistantWaitingForTool(true);
      } else {
        setAssistantWaitingForTool(false);
      }
      // If assistant message is completed, stop thinking
      if (item.role === 'assistant' && item.status === 'completed') {
        setAssistantThinking(false);
      }
      // --- FORCE: Always reply after tool response, with logging ---
      if (item && typeof item === 'object' && 'type' in item && item.type === 'function_call_output' && item.formatted && typeof item.formatted === 'object' && 'output' in item.formatted && item.formatted.output) {
        console.log('[Assistant] Tool response received:', item.formatted.output);
        // Try to parse the tool output as JSON
        let toolData: any;
        try {
          if (typeof (item.formatted as any).output === 'string') {
            toolData = JSON.parse((item.formatted as any).output);
          } else {
            toolData = { summary: String((item.formatted as any).output) };
          }
        } catch (e) {
          toolData = { summary: String((item.formatted as any).output) };
        }
        // Prefer summary, then document_content, then raw output
        const answer = (toolData && typeof toolData === 'object' && ('summary' in toolData || 'document_content' in toolData))
          ? (toolData.summary || toolData.document_content)
          : (item.formatted as any).output;
        // Always append a new assistant message to the items state, even if one exists
        setItems(prev => ([
          ...prev,
          {
            id: `assistant-auto-${Date.now()}`,
            role: 'assistant',
            status: 'completed',
            formatted: { text: answer },
            created_at: Date.now(),
          } as unknown as ItemType
        ]));
        console.log('[Assistant] Appended assistant reply:', answer);
        setAssistantThinking(false);
        setAssistantWaitingForTool(false);
        // Force a state update to ensure React re-renders
        setTimeout(() => setItems(items => [...items]), 0);
      }
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  /**
   * Effect: Pause VAD when assistant is speaking, resume after
   */
  useEffect(() => {
    const wavRecorder = wavRecorderRef.current;
    const client = clientRef.current;
    if (isAssistantSpeaking) {
      // Pause VAD recording if active
      if (client.getTurnDetectionType() === 'server_vad' && wavRecorder.getStatus() === 'recording') {
        wavRecorder.pause();
      }
    } else {
      // Resume VAD recording if VAD mode is active and connected
      if (client.getTurnDetectionType() === 'server_vad' && client.isConnected()) {
        wavRecorder.record((data) => client.appendInputAudio(data.mono));
      }
    }
  }, [isAssistantSpeaking]);

  /**
   * Helper: Check if assistant is thinking (in_progress, tool call, or waiting for response)
   */
  useEffect(() => {
    // If the last item is a user message and the next assistant message is not yet completed, show thinking
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      // If last is user, and no completed assistant after, show thinking
      if (lastItem.role === 'user') {
        setAssistantThinking(true);
      } else if (lastItem.role === 'assistant' && 'status' in lastItem && lastItem.status !== 'completed') {
        setAssistantThinking(true);
      } else {
        setAssistantThinking(false);
      }
    } else {
      setAssistantThinking(false);
    }
  }, [items]);

  // Helper: Start fallback timer after user message
  const startFallbackTimer = () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setItems(prev => ([
        ...prev,
        {
          id: `assistant-fallback-${Date.now()}`,
          role: 'assistant',
          status: 'completed',
          formatted: { text: 'Sorry, I’m still working on your answer. Please wait a moment or try again.' },
          created_at: Date.now(),
        } as unknown as ItemType
      ]));
      setAssistantThinking(false);
      setAssistantWaitingForTool(false);
    }, 8000); // 8 seconds fallback
  };

  // Watch for new user messages to start fallback timer
  useEffect(() => {
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      if (lastItem.role === 'user') {
        setLastUserMessageTime(Date.now());
        startFallbackTimer();
      }
    }
    // Cleanup on unmount
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [items]);

  // Clear fallback timer when assistant responds
  useEffect(() => {
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      if (lastItem.role === 'assistant' && 'status' in lastItem && lastItem.status === 'completed') {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      }
    }
  }, [items]);

  // When ragReady changes, process queued messages if both are ready
  useEffect(() => {
    processQueuedMessagesIfReady();
  }, [ragReady]);

  // NEW: useEffect to process queued messages when either ragReady or toolReady changes
  useEffect(() => {
    processQueuedMessagesIfReady();
  }, [ragReady, toolReady]);

  /**
   * Render the application
   */
  const noDocsIndexed = ragStats && ragStats.totalDocuments === 0;
  // UI: Disable all input until both are ready
  const inputDisabled = !ragReady || !toolReady;
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src="/openai-logomark.svg" />
          <span>realtime console</span>
        </div>
        <div className="content-api-key">
          {!LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              label={`api key: ${apiKey.slice(0, 3)}...`}
              onClick={() => resetAPIKey()}
            />
          )}
        </div>
      </div>
      <div className="content-main" style={{ display: 'flex', flexDirection: 'row', width: '100%', position: 'relative' }}>
        {/* Wrapper for events panel, position: relative */}
        <div style={{ position: 'relative', height: '100%', width: eventsCollapsed ? 0 : '340px', minWidth: eventsCollapsed ? 0 : '340px', transition: 'width 0.2s, min-width 0.2s', overflow: 'hidden' }}>
          <div className={`content-events ${eventsCollapsed ? 'collapsed' : ''}`} style={{ position: 'relative', height: '100%', width: '100%' }}>
            <div className="content-block events">
              <div className="visualization">
                <div className="visualization-entry client">
                  <canvas ref={clientCanvasRef} />
                </div>
                <div className="visualization-entry server">
                  <canvas ref={serverCanvasRef} />
                </div>
              </div>
              <div className="content-block-title">events</div>
              <div className="content-block-body" ref={eventsScrollRef}>
                {!realtimeEvents.length && `awaiting connection...`}
                {realtimeEvents.map((realtimeEvent, i) => {
                  const count = realtimeEvent.count;
                  const event = { ...realtimeEvent.event };
                  if (event.type === 'input_audio_buffer.append') {
                    event.audio = `[trimmed: ${event.audio.length} bytes]`;
                  } else if (event.type === 'response.audio.delta') {
                    event.delta = `[trimmed: ${event.delta.length} bytes]`;
                  }
                  return (
                    <div className="event" key={event.event_id}>
                      <div className="event-timestamp">
                        {formatTime(realtimeEvent.time)}
                      </div>
                      <div className="event-details">
                        <div
                          className="event-summary"
                          onClick={() => {
                            // toggle event details
                            const id = event.event_id;
                            const expanded = { ...expandedEvents };
                            if (expanded[id]) {
                              delete expanded[id];
                            } else {
                              expanded[id] = true;
                            }
                            setExpandedEvents(expanded);
                          }}
                        >
                          <div
                            className={`event-source ${
                              event.type === 'error'
                                ? 'error'
                                : realtimeEvent.source
                            }`}
                          >
                            {realtimeEvent.source === 'client' ? (
                              <ArrowUp />
                            ) : (
                              <ArrowDown />
                            )}
                            <span>
                              {event.type === 'error'
                                ? 'error!'
                                : realtimeEvent.source}
                            </span>
                          </div>
                          <div className="event-type">
                            {event.type}
                            {count && ` (${count})`}
                          </div>
                        </div>
                        {!!expandedEvents[event.event_id] && (
                          <div className="event-payload">
                            {JSON.stringify(event, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {/* Always render the toggle button, absolutely positioned relative to content-main */}
        <div 
          className="events-toggle"
          style={{
            position: 'absolute',
            left: eventsCollapsed ? 0 : '340px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1000,
            background: '#f4f6fa',
            borderRadius: eventsCollapsed ? '6px 0 0 6px' : '0 6px 6px 0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: 0,
            width: '28px',
            height: '28px',
            minWidth: '28px',
            minHeight: '28px',
            cursor: 'pointer',
            border: '1px solid #e0e3e8',
            borderRight: eventsCollapsed ? 'none' : undefined,
            borderLeft: eventsCollapsed ? undefined : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            fontWeight: 400,
            color: '#555',
            transition: 'background 0.15s, box-shadow 0.15s, left 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.background = '#e9ecf2'}
          onMouseOut={e => e.currentTarget.style.background = '#f4f6fa'}
          onClick={() => setEventsCollapsed(!eventsCollapsed)}
        >
          {eventsCollapsed ? '▶' : '◀'}
        </div>
        {/* Main chat/content area, expands to full width when eventsCollapsed */}
        <div className="content-chat" style={{ flex: 1, transition: 'margin 0.2s', marginLeft: eventsCollapsed ? 0 : '16px' }}>
          {showDocumentUploader && (
            <DocumentUploader
              onDocumentsProcessed={(stats: any) => {
                setRagStats(stats);
                setShowDocumentUploader(false);
              }}
              isProcessing={ragInitializing}
            />
          )}
          <div className="content-block conversation">
            <div className="content-block-title">Chat</div>
            <div className="content-block-body chat-container" data-conversation-content>
              {!items.length && (
                <div className="chat-welcome">
                  <div className="welcome-message">
                    Welcome! Connect to start a voice conversation.
                    <br />
                    <small>Your conversation history will be preserved when you disconnect.</small>
                  </div>
                </div>
              )}
              {noDocsIndexed && (
                <div style={{ textAlign: 'center', color: '#990000', margin: '8px 0', fontWeight: 600 }}>
                  No documents are indexed. Please upload or add documents to enable assistant responses.
                </div>
              )}
              {assistantThinking && !assistantWaitingForTool && (
                <div style={{ textAlign: 'center', color: '#0099ff', margin: '8px 0', fontStyle: 'italic' }}>
                  🤖 Give me a moment, I’m thinking...
                </div>
              )}
              {assistantWaitingForTool && (
                <div style={{ textAlign: 'center', color: '#ff9500', margin: '8px 0' }}>
                  Assistant is searching documents and will respond soon...
                </div>
              )}
              {items.map((conversationItem, i) => {
                const isUser = conversationItem.role === 'user';
                const isAssistant = conversationItem.role === 'assistant';
                
                return (
                  <div className={`chat-message ${isUser ? 'user-message' : 'assistant-message'}`} key={conversationItem.id}>
                    <div className="message-avatar">
                      {isUser ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-sender">
                          {isUser ? 'You' : 'Assistant'}
                        </span>
                        <div
                          className="message-delete"
                          onClick={() => deleteConversationItem(conversationItem.id)}
                        >
                          <X />
                        </div>
                      </div>
                      
                      {/* User message content */}
                      {isUser && (
                        <div className="message-text">
                          {conversationItem.formatted.transcript ||
                            (conversationItem.formatted.audio?.length
                              ? '(awaiting transcript)'
                              : conversationItem.formatted.text ||
                                '(voice message)')}
                        </div>
                      )}
                      
                      {/* Assistant message content */}
                      {isAssistant && (
                        <div className="message-text">
                          {conversationItem.formatted.transcript ||
                            conversationItem.formatted.text ||
                            '(processing...)'}
                        </div>
                      )}
                      
                      {/* Tool calls */}
                      {!!conversationItem.formatted.tool && (
                        <div className="message-tool">
                          <div className="tool-label">Tool Call:</div>
                          <div className="tool-name">
                            {conversationItem.formatted.tool.name}
                          </div>
                          <div className="tool-args">
                            {conversationItem.formatted.tool.arguments}
                          </div>
                        </div>
                      )}
                      
                      {/* Tool responses */}
                      {conversationItem.type === 'function_call_output' && (
                        <div className="message-tool-output">
                          <div className="tool-output-label">Tool Response:</div>
                          <div className="tool-output-content">
                            {conversationItem.formatted.output}
                          </div>
                        </div>
                      )}
                      
                      {/* Audio playback */}
                      {conversationItem.formatted.file && (
                        <div className="message-audio">
                          <audio
                            src={conversationItem.formatted.file.url}
                            controls
                            className="audio-player"
                            onPlay={() => setIsAssistantSpeaking(true)}
                            onEnded={() => setIsAssistantSpeaking(false)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="content-actions">
            <MicrophoneSelector
              wavRecorder={wavRecorderRef.current}
              isConnected={isConnected}
              onDeviceChange={setSelectedDeviceId}
            />
            <div className="spacer" />
            <Toggle
              defaultValue={false}
              labels={['manual', 'vad']}
              values={['none', 'server_vad']}
              onChange={(_, value) => changeTurnEndType(value)}
            />
            <div className="spacer" />
            {isConnected && canPushToTalk && (
              <Button
                label={isRecording ? 'release to send' : 'push to talk'}
                buttonStyle={isRecording ? 'alert' : 'regular'}
                disabled={inputDisabled || !isConnected || !canPushToTalk}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
              />
            )}
            <div className="spacer" />
            <Button
              label={isConnected ? 'disconnect' : 'connect'}
              iconPosition={isConnected ? 'end' : 'start'}
              icon={isConnected ? X : Zap}
              buttonStyle={isConnected ? 'regular' : 'action'}
              onClick={
                isConnected ? disconnectConversation : connectConversation
              }
            />
            {items.length > 0 && (
              <>
                <div className="spacer" />
                <Button
                  label="clear chat"
                  buttonStyle="flush"
                  onClick={clearConversation}
                />
              </>
            )}
            <div className="spacer" />
            <Button
              label={ragInitializing ? 'initializing...' : ragStats ? `${ragStats.totalDocuments} docs` : 'init RAG'}
              icon={FileText}
              buttonStyle={ragStats ? 'regular' : 'action'}
              disabled={ragInitializing}
              onClick={initializeRAG}
                        />
            <div className="spacer" />
            <Button
              label="upload docs"
              icon={Upload}
              buttonStyle="flush"
              onClick={() => setShowDocumentUploader(!showDocumentUploader)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
