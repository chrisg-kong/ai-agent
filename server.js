// server.js
import express from 'express';
import { agent, llmOpenAI, mcp } from 'volcano-sdk';
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Create the base provider
const baseOpenAI = llmOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'Chris',
  baseURL: 'http://host.docker.internal:8000/1',
  model: 'gpt-4.1-mini',
});

// Wrap it to add logging
function loggingProvider(base) {
  return {
    ...base,
    async gen(input) {
     // console.log('>>> Volcano → Kong gen payload:', JSON.stringify(input, null, 2));
      try {
        const result = await base.gen(input);
      //  console.log('<<< Kong gen response:', JSON.stringify(result, null, 2));
        return result;
      } catch (err) {
       // console.error('<<< Kong gen error:', err);
        throw err;
      }
    },
    async genWithTools(input, tools) {
     // console.log('>>> Volcano → Kong genWithTools payload:', JSON.stringify({ input, tools }, null, 2));
      try {
        const result = await base.genWithTools(input, tools);
     //   console.log('<<< Kong genWithTools response:', JSON.stringify(result, null, 2));
        return result;
      } catch (err) {
     //   console.error('<<< Kong genWithTools error:', err);
        throw err;
      }
    }
  };
}

const openai = loggingProvider(baseOpenAI);

const serviceNames = ['vehicles'];
const mcps = serviceNames.map(name =>
  mcp(`http://host.docker.internal:8000/${name}`)
);


async function runAgentMCPS(messages) {
  //new agent each time so no context ensures message history is consistent from browser and can reset with a refresh
  const volcanoAgent = agent({ llm: openai });
  const out = await volcanoAgent
    .then({
      prompt: `${JSON.stringify(messages, null, 2)}`, // use the array from the client directly
      mcps
    })
    .run();

  console.dir(out, { depth: null });

  const final = [...out].reverse().find(s => s.llmOutput);

  return {
    model: final?.llmInfo?.model || process.env.OPENAI_MODEL,
    reply: final?.llmOutput || 'Sorry, I could not produce a response.',
  };
}

async function runAgent(messages) {
  //new agent each time so no context
  const volcanoAgent = agent({ llm: openai });
  const out = await volcanoAgent
    .then({
      prompt: `${JSON.stringify(messages, null, 2)}`, // use the array from the client directly
      
    })
    .run();

  console.dir(out, { depth: null });

  const final = [...out].reverse().find(s => s.llmOutput);

  return {
    model: final?.llmInfo?.model || process.env.OPENAI_MODEL,
    reply: final?.llmOutput || 'Sorry, I could not produce a response.',
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Express route ---
app.post('/api/chat', async (req, res) => {
  try {
    const allMessages = req.body.messages || [];

   // const result = await runAgent(allMessages);

       const lastUserMsg = allMessages.at(-1)?.content || '';

    // Regex to detect MCP key words (case‑insensitive)
    const needsMcp = /\b(fetch|list|retrieve|weather)\b/i.test(lastUserMsg);

    // Call the right runner
    const result = needsMcp
      ? await runAgentMCPS(allMessages)
      : await runAgent(allMessages);



    res.json({
      response: result.reply
    });
  } catch (err) {
    console.error('Volcano agent error:', err);

     // Detect 429 rate limit
    if (err.status === 429 || (err.cause && err.cause.status === 429)) {
      return res.status(429).json({
        error: 'Rate limit has been hit. Please wait a few seconds and try again.',
      });
    }
    res.status(500).json({
      error:
        'Sorry I am unable to help right now, please ask me something else',
    });
  }
});


app.listen(PORT, () => {
  console.log(`AI agent (Volcano) listening on http://0.0.0.0:${PORT}`);
});
