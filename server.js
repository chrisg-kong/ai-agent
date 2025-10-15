// server.js
import express from 'express';
import { agent, llmOpenAI, mcp } from 'volcano-sdk';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());


// Environment variables with sensible defaults
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'Chris';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'http://host.docker.internal:8000/1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const MCP_SERVICE_NAMES = (process.env.MCP_SERVICE_NAMES || 'vehicles,weather').split(',').map(s => s.trim()).filter(Boolean);
const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://host.docker.internal:8000';

// Create OpenAI provider
const openai = llmOpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
  model: OPENAI_MODEL,
});

// MCP services
const mcps = MCP_SERVICE_NAMES.map(name =>
  mcp(`${MCP_BASE_URL}/${name}`)
);

// --- Express route ---
app.post('/api/chat', async (req, res) => {
  try {
    const allMessages = req.body.messages || [];
    const lastUserMsg = allMessages.at(-1)?.content || '';

    // Regex to detect MCP key words (case‑insensitive)
    const needsMcp = /\b(fetch|list|retrieve|weather)\b/i.test(lastUserMsg);
    
    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const volcanoAgent = agent({ llm: openai });
    
    const config = {
      prompt: JSON.stringify(allMessages, null, 2),
      ...(needsMcp && { mcps })
    };
    
    const stream = await volcanoAgent.then(config).stream();
    
    let fullResponse = '';
    let chunkCount = 0;
    
    console.log('--- Starting stream ---');
    
    for await (const chunk of stream) {
      console.log(`Chunk ${++chunkCount}:`, chunk);
      
      if (chunk.llmOutput) {
        fullResponse += chunk.llmOutput;
        // Send the chunk to the client
        res.write(`data: ${JSON.stringify({ chunk: chunk.llmOutput, done: false })}\n\n`);
      }
    }
    
    console.log('--- Stream complete ---');
    console.log('Full response length:', fullResponse.length);
    
    // Send final message
    res.write(`data: ${JSON.stringify({ chunk: '', done: true, fullResponse })}\n\n`);
    res.end();
    
  } catch (err) {
    console.error('Volcano agent error:', err);

    // For streaming errors, send error as SSE
    const errorMessage = (() => {
      if (err.status === 429 || err.cause?.status === 429) {
        return 'Rate limit has been hit. Please wait a few seconds and try again.';
      }
      if (err.status === 400 || err.cause?.status === 400) {
        return 'Your message was blocked by content filters. Please rephrase your request.';
      }
      return 'Sorry I am unable to help right now, please ask me something else';
    })();
    
    res.write(`data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`AI agent (Volcano) listening on http://0.0.0.0:${PORT}`);
});
