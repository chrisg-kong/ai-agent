// server.js
import express from 'express';
import { agent, llmOpenAI, mcp } from 'volcano-sdk';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());


// Environment variables with sensible defaults
const KONG_API_KEY = process.env.KONG_API_KEY;
const KONG_BASE_URL = process.env.KONG_BASE_URL;
const KONG_MODEL = process.env.KONG_MODEL;
const MCP_SERVICE_NAMES = (process.env.MCP_SERVICE_NAMES).split(',').map(s => s.trim()).filter(Boolean);
const MCP_BASE_URL = process.env.MCP_BASE_URL;

console.log('=== Configuration ===');
console.log('API Key:', KONG_API_KEY ? `${KONG_API_KEY.substring(0, 20)}...` : 'NOT SET');
console.log('Base URL:', KONG_BASE_URL);
console.log('Model:', KONG_MODEL);
console.log('MCP Services:', MCP_SERVICE_NAMES);
console.log('MCP Base URL:', MCP_BASE_URL);
console.log('====================');

// Create OpenAI provider
const kongProvider = llmOpenAI({
  apiKey: KONG_API_KEY,
  baseURL: KONG_BASE_URL,
  model: KONG_MODEL,
});

// MCP services
const mcps = MCP_SERVICE_NAMES.map(name =>
  mcp(`${MCP_BASE_URL}/${name}`, {
    auth: {
      type: "bearer",
      token: KONG_API_KEY,
    },
  })
);

// --- Express route with Volcano streaming ---
app.post('/api/chat', async (req, res) => {
  try {
    const allMessages = req.body.messages || [];
    const lastUserMsg = allMessages.at(-1)?.content || '';

    // Regex to detect MCP key words (case‑insensitive)
    const needsMcp = /\b(fetch|list|retrieve|weather)\b/i.test(lastUserMsg);
    
    // Set headers for streaming text
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const volcanoAgent = agent({ llm: kongProvider });
    
    const config = {
      prompt: JSON.stringify(allMessages, null, 2),
      ...(needsMcp && { mcps })
    };
    
    // Use Volcano's .stream() method
    const stream = await volcanoAgent.then(config).stream();
    
    console.log('--- Starting stream ---');
    
    let chunkCount = 0;
    let totalChars = 0;
    
    for await (const chunk of stream) {
      console.log(`Chunk ${++chunkCount}:`, JSON.stringify(chunk));
      
      if (chunk.llmOutput) {
        totalChars += chunk.llmOutput.length;
        // Send just the text content directly
        res.write(chunk.llmOutput);
      }
    }
    
    console.log(`--- Stream complete --- (${chunkCount} chunks, ${totalChars} chars)`);
    res.end();
    
  } catch (err) {
    console.error('Volcano agent error:', err);

    const errorMessage = (() => {
      if (err.status === 429 || err.cause?.status === 429) {
        return 'Rate limit has been hit. Please wait a few seconds and try again.';
      }
      if (err.status === 400 || err.cause?.status === 400) {
        return 'Your message was blocked by content filters. Please rephrase your request.';
      }
      return 'Sorry I am unable to help right now, please ask me something else';
    })();
    
    res.write(errorMessage);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`AI agent (Volcano) listening on http://0.0.0.0:${PORT}`);
});
