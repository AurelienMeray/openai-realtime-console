import { RealtimeRelay } from './lib/relay.js';
import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error(
    `Environment variable "OPENAI_API_KEY" is required.\n` +
      `Please set it in your .env file.`
  );
  process.exit(1);
}

const app = express();
app.use(cors());

// Serve the assets-manifest endpoint
app.get('/assets-manifest', (req, res) => {
  const assetsDir = path.join(__dirname, '../public/assets');
  fs.readdir(assetsDir, (err, files) => {
    if (err) {
      res.status(500).json({ error: 'Failed to read assets directory' });
      return;
    }
    // Only include files (not directories)
    const filtered = files.filter(f => !f.startsWith('.') && !fs.lstatSync(path.join(assetsDir, f)).isDirectory());
    res.json(filtered);
  });
});

// Start both the relay server and the express app
const PORT = parseInt(process.env.PORT) || 8081;

const relay = new RealtimeRelay(OPENAI_API_KEY);
relay.listen(PORT);

app.listen(PORT + 1, () => {
  console.log(`Express server listening on http://localhost:${PORT + 1}`);
});
