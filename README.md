# OpenAI Realtime Console

A web-based console for interacting with the OpenAI Realtime API. This app allows you to:
- Have real-time voice conversations with OpenAI models
- Upload and process documents (Word, PDF, etc.)
- Inspect and debug API interactions
- Use advanced audio tools for recording and playback
- Ask questions and get answers sourced from your own documents using Retrieval-Augmented Generation (RAG)

<img src="/readme/realtime-console-demo.png" width="800" />

---

## Features
- **Real-time voice chat**: Speak to the model using your microphone, with push-to-talk and voice-activity-detection modes.
- **Document upload**: Upload DOCX, PDF, and other supported files for processing and interaction.
- **Retrieval-Augmented Generation (RAG)**: The assistant can search your uploaded documents to answer your questions, citing sources directly from your files.
- **Audio tools**: Record, play back, and analyze audio in the browser.
- **API inspector**: View and debug the real-time API messages and responses.

---

## Quick Start

1. **Install dependencies**
   ```sh
   npm install
   ```
2. **Create a `.env` file** in the project root with your OpenAI API key:
   ```env
   OPENAI_API_KEY=YOUR_API_KEY
   REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
   ```
3. **Start the relay server** (in one terminal):
   ```sh
   npm run relay
   ```
4. **Start the React app** (in another terminal):
   ```sh
   npm start
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.
6. **Upload documents** using the "Upload docs" button in the UI. The assistant will use these documents to answer your questions.

---

## How the RAG Tool Works
- The app includes a built-in Retrieval-Augmented Generation (RAG) tool called `search_documents`.
- When you ask a question, the assistant uses this tool to search through your uploaded documents for relevant information.
- The assistant's answers are based on the content of your documents and will cite the source document and page number when possible.
- You can upload new documents at any time, and the assistant will immediately be able to use them for future questions.

---

## Developer Guide
- See `/src/lib/wavtools` for audio utilities.
- The relay server code is in `/relay-server`.
- The RAG logic is implemented in `/src/lib/ragService.js` and `/src/lib/documentProcessor.js`.
- You can extend the app with new features or tools as needed.

---

## Acknowledgements
Thanks to the OpenAI Realtime API team and contributors. For questions or feedback, open an issue or reach out via the links below.

# Using the console

The console requires an OpenAI API key (**user key** or **project key**) that has access to the
Realtime API. You'll be prompted on startup to enter it. It will be saved via `localStorage` and can be
changed at any time from the UI.

To start a session you'll need to **connect**. This will require microphone access.
You can then choose between **manual** (Push-to-talk) and **vad** (Voice Activity Detection)
conversation modes, and switch between them at any time.

There are two functions enabled;

- `set_memory`: You can ask the model to remember information for you, and it will store it in
  a JSON blob on the left.

You can freely interrupt the model at any time in push-to-talk or VAD mode.

## Using a relay server

If you would like to build a more robust implementation and play around with the reference
client using your own server, we have included a Node.js [Relay Server](/relay-server/index.js).

```shell
$ npm run relay
```

It will start automatically on `localhost:8081`.

**You will need to create a `.env` file** with the following configuration:

```conf
OPENAI_API_KEY=YOUR_API_KEY
REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
```

You will need to restart both your React app and relay server for the `.env.` changes
to take effect. The local server URL is loaded via [`ConsolePage.tsx`](/src/pages/ConsolePage.tsx).
To stop using the relay server at any time, simply delete the environment
variable or set it to empty string.

```javascript
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
```

This server is **only a simple message relay**, but it can be extended to:

- Hide API credentials if you would like to ship an app to play with online
- Handle certain calls you would like to keep secret (e.g. `instructions`) on
  the server directly
- Restrict what types of events the client can receive and send

You will have to implement these features yourself.

# Realtime API reference client

The latest reference client and documentation are available on GitHub at
[openai/openai-realtime-api-beta](https://github.com/openai/openai-realtime-api-beta).

You can use this client yourself in any React (front-end) or Node.js project.
For full documentation, refer to the GitHub repository, but you can use the
guide here as a primer to get started.

```javascript
import { RealtimeClient } from '/src/lib/realtime-api-beta/index.js';

const client = new RealtimeClient({ apiKey: process.env.OPENAI_API_KEY });

// Can set parameters ahead of connecting
client.updateSession({ instructions: 'You are a great, upbeat friend.' });
client.updateSession({ voice: 'alloy' });
client.updateSession({ turn_detection: 'server_vad' });
client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

// Set up event handling
client.on('conversation.updated', ({ item, delta }) => {
  const items = client.conversation.getItems(); // can use this to render all items
  /* includes all changes to conversations, delta may be populated */
});

// Connect to Realtime API
await client.connect();

// Send an item and triggers a generation
client.sendUserMessageContent([{ type: 'text', text: `How are you?` }]);
```

## Sending streaming audio

To send streaming audio, use the `.appendInputAudio()` method. If you're in `turn_detection: 'disabled'` mode,
then you need to use `.generate()` to tell the model to respond.

```javascript
// Send user audio, must be Int16Array or ArrayBuffer
// Default audio format is pcm16 with sample rate of 24,000 Hz
// This populates 1s of noise in 0.1s chunks
for (let i = 0; i < 10; i++) {
  const data = new Int16Array(2400);
  for (let n = 0; n < 2400; n++) {
    const value = Math.floor((Math.random() * 2 - 1) * 0x8000);
    data[n] = value;
  }
  client.appendInputAudio(data);
}
// Pending audio is committed and model is asked to generate
client.createResponse();
```

## Adding and using tools

Working with tools is easy. Just call `.addTool()` and set a callback as the second parameter.
The callback will be executed with the parameters for the tool, and the result will be automatically
sent back to the model.

```javascript
// We can add tools as well, with callbacks specified
client.addTool(
  {
    name: 'search_documents',
    description:
      'Searches through your uploaded documents for relevant information. Specify a query.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query to search for.',
        },
      },
      required: ['query'],
    },
  },
  async ({ query }) => {
    // This is a placeholder for the actual RAG logic.
    // In a real app, you would use a document processor and a search service.
    console.log(`Searching for: ${query}`);
    return {
      answer: `I found some information about "${query}". However, this is a placeholder and the actual RAG logic is not yet implemented.`,
      sources: [],
    };
  }
);
```

## Interrupting the model

You may want to manually interrupt the model, especially in `turn_detection: 'disabled'` mode.
To do this, we can use:

```javascript
// id is the id of the item currently being generated
// sampleCount is the number of audio samples that have been heard by the listener
client.cancelResponse(id, sampleCount);
```

This method will cause the model to immediately cease generation, but also truncate the
item being played by removing all audio after `sampleCount` and clearing the text
response. By using this method you can interrupt the model and prevent it from "remembering"
anything it has generated that is ahead of where the user's state is.

## Reference client events

There are five main client events for application control flow in `RealtimeClient`.
Note that this is only an overview of using the client, the full Realtime API
event specification is considerably larger, if you need more control check out the GitHub repository:
[openai/openai-realtime-api-beta](https://github.com/openai/openai-realtime-api-beta).

```javascript
// errors like connection failures
client.on('error', (event) => {
  // do thing
});

// in VAD mode, the user starts speaking
// we can use this to stop audio playback of a previous response if necessary
client.on('conversation.interrupted', () => {
  /* do something */
});

// includes all changes to conversations
// delta may be populated
client.on('conversation.updated', ({ item, delta }) => {
  // get all items, e.g. if you need to update a chat window
  const items = client.conversation.getItems();
  switch (item.type) {
    case 'message':
      // system, user, or assistant message (item.role)
      break;
    case 'function_call':
      // always a function call from the model
      break;
    case 'function_call_output':
      // always a response from the user / application
      break;
  }
  if (delta) {
    // Only one of the following will be populated for any given event
    // delta.audio = Int16Array, audio added
    // delta.transcript = string, transcript added
    // delta.arguments = string, function arguments added
  }
});

// only triggered after item added to conversation
client.on('conversation.item.appended', ({ item }) => {
  /* item status can be 'in_progress' or 'completed' */
});

// only triggered after item completed in conversation
// will always be triggered after conversation.item.appended
client.on('conversation.item.completed', ({ item }) => {
  /* item status will always be 'completed' */
});
```

# Wavtools

Wavtools contains easy management of PCM16 audio streams in the browser, both
recording and playing.

## WavRecorder Quickstart

```javascript
import { WavRecorder } from '/src/lib/wavtools/index.js';

const wavRecorder = new WavRecorder({ sampleRate: 24000 });
wavRecorder.getStatus(); // "ended"

// request permissions, connect microphone
await wavRecorder.begin();
wavRecorder.getStatus(); // "paused"

// Start recording
// This callback will be triggered in chunks of 8192 samples by default
// { mono, raw } are Int16Array (PCM16) mono & full channel data
await wavRecorder.record((data) => {
  const { mono, raw } = data;
});
wavRecorder.getStatus(); // "recording"

// Stop recording
await wavRecorder.pause();
wavRecorder.getStatus(); // "paused"

// outputs "audio/wav" audio file
const audio = await wavRecorder.save();

// clears current audio buffer and starts recording
await wavRecorder.clear();
await wavRecorder.record();

// get data for visualization
const frequencyData = wavRecorder.getFrequencies();

// Stop recording, disconnects microphone, output file
await wavRecorder.pause();
const finalAudio = await wavRecorder.end();

// Listen for device change; e.g. if somebody disconnects a microphone
// deviceList is array of MediaDeviceInfo[] + `default` property
wavRecorder.listenForDeviceChange((deviceList) => {});
```

## WavStreamPlayer Quickstart

```javascript
import { WavStreamPlayer } from '/src/lib/wavtools/index.js';

const wavStreamPlayer = new WavStreamPlayer({ sampleRate: 24000 });

// Connect to audio output
await wavStreamPlayer.connect();

// Create 1s of empty PCM16 audio
const audio = new Int16Array(24000);
// Queue 3s of audio, will start playing immediately
wavStreamPlayer.add16BitPCM(audio, 'my-track');
wavStreamPlayer.add16BitPCM(audio, 'my-track');
wavStreamPlayer.add16BitPCM(audio, 'my-track');

// get data for visualization
const frequencyData = wavStreamPlayer.getFrequencies();

// Interrupt the audio (halt playback) at any time
// To restart, need to call .add16BitPCM() again
const trackOffset = await wavStreamPlayer.interrupt();
trackOffset.trackId; // "my-track"
trackOffset.offset; // sample number
trackOffset.currentTime; // time in track
```

# Acknowledgements and contact

Thanks for checking out the Realtime Console. We hope you have fun with the Realtime API.
Special thanks to the whole Realtime API team for making this possible. Please feel free
to reach out, ask questions, or give feedback by creating an issue on the repository.
You can also reach out and let us know what you think directly!

- OpenAI Developers / [@OpenAIDevs](https://x.com/OpenAIDevs)
- Jordan Sitkin / API / [@dustmason](https://x.com/dustmason)
- Mark Hudnall / API / [@landakram](https://x.com/landakram)
- Peter Bakkum / API / [@pbbakkum](https://x.com/pbbakkum)
- Atty Eleti / API / [@athyuttamre](https://x.com/athyuttamre)
- Jason Clark / API / [@onebitToo](https://x.com/onebitToo)
- Karolis Kosas / Design / [@karoliskosas](https://x.com/karoliskosas)
- Keith Horwood / API + DX / [@keithwhor](https://x.com/keithwhor)
- Romain Huet / DX / [@romainhuet](https://x.com/romainhuet)
- Katia Gil Guzman / DX / [@kagigz](https://x.com/kagigz)
- Ilan Bigio / DX / [@ilanbigio](https://x.com/ilanbigio)
- Kevin Whinnery / DX / [@kevinwhinnery](https://x.com/kevinwhinnery)
