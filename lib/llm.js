/**
 * Simulates or performs the LLM call.
 */
export async function generateContent(model, systemPrompt, userMessage) {
    // Check for Local LLM URL first (e.g. Ollama or LM Studio)
    const localUrl = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1/chat/completions';
    const useLocal = process.env.USE_LOCAL_LLM === 'true';
    const usePython = process.env.USE_PYTHON_BACKEND === 'true';
    const pythonUrl = process.env.PYTHON_SERVER_URL || 'http://localhost:5001/generate';
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    // Defaults to the user's requested model if using local, otherwise passed model
    const targetModel = (useLocal || usePython) ? "meta-llama/Llama-4-Scout-17B-16E-Instruct" : model;

    // 0. Python Backend Strategy (Custom Server)
    if (usePython) {
        try {
            console.log(`Attempting Python Server call to ${pythonUrl}`);
            const response = await fetch(pythonUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userMessage,
                    system_prompt: systemPrompt
                })
            });

            if (!response.ok) {
                throw new Error(`Python Server Error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.text;
        } catch (error) {
            console.warn("Python Server failed:", error);
            // If we are strictly using Python Backend (no local, no rapid), return the error
            if (!useLocal && !rapidApiKey) {
                return `**Python Backend Error**: ${error.message}\n\n*Check Vercel Environment Variables and Render Server logs.*`;
            }
        }
    }

    // 1. Local LLM Strategy (Preferred if configured)
    if (useLocal) {
        try {
            console.log(`Attempting Local LLM call to ${localUrl} with model ${targetModel}`);
            const response = await fetch(localUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: targetModel,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                throw new Error(`Local LLM Error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.warn("Local LLM failed, falling back or erroring:", error);
            if (!rapidApiKey && !usePython) {
                // Only mock if we really have no other options
                console.warn("No RapidAPI key found, returning mock response after local LLM failure.");
                return await mockResponse(targetModel);
            }
            // If local failed but we have a key, fall through to RapidAPI.
        }
    }

    // 2. RapidAPI Strategy (Legacy/Backup)
    if (rapidApiKey) {
        try {
            const response = await fetch('https://cheapest-gpt-4-turbo-gpt-4-vision-chatgpt-openai-ai-api.p.rapidapi.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-rapidapi-host': 'cheapest-gpt-4-turbo-gpt-4-vision-chatgpt-openai-ai-api.p.rapidapi.com',
                    'x-rapidapi-key': rapidApiKey
                },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                    model: "gpt-4o", // RapidAPI specific
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`RapidAPI Error: ${err}`);
            }
            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error("RapidAPI Failed:", error);
            // If RapidAPI also fails, fall through to mock response
        }
    }

    console.warn("No valid LLM provider found or all providers failed.");

    // Return a helpful error message to the UI instead of a mock, since the user requested "actual output"
    return `# Configuration Required

I cannot generate real output because no AI provider is configured or reachable.

**1. Local LLM (Recommended)**
- Ensure your local server (e.g., Ollama) is running at \`${localUrl}\`.
- Run: \`ollama run ${targetModel}\`
- Restart this app: \`npm run dev\`

**2. RapidAPI**
- Add \`RAPIDAPI_KEY\` to your \`.env.local\` file.

**3. Python Backend (Hugging Face)**
- Ensure \`HF_TOKEN\` and \`USE_PYTHON_BACKEND=true\` are in \`.env.local\`.
- Ensure the python server is running: \`python3 server.py\`

**4. Debug Info**
- Local URL: ${localUrl}
- Use Local: ${useLocal}
- Use Python: ${usePython}
- Rapid Key Found: ${!!rapidApiKey}
`;
}

async function mockResponse(model) {
    // Mock response function kept for reference but not used by default now
    await new Promise(resolve => setTimeout(resolve, 1500));
    return `**[Mock Generated Content]**...`;
}
