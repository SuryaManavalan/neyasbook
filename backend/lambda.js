const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { OpenAI } = require('openai');
const s3Storage = require('./storage/s3');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Use S3 for storage
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const getStorageKey = (projectId, type, key) => {
    if (type === 'manifest') return `projects/${projectId}/manifest.json`;
    if (type === 'chapter') return `projects/${projectId}/chapters/${key}.json`;
    if (type === 'entity') return key ? `projects/${projectId}/entities/profiles/${key}.json` : `projects/${projectId}/entities/index.json`;
    if (type === 'chat') return `projects/${projectId}/chat.json`;
    if (type === 'sweep') return `projects/${projectId}/sweeps/${key}.json`;
    return `projects/${projectId}/${key}`;
};

// Storage helpers
async function readData(projectId, type, key = null) {
    const storageKey = getStorageKey(projectId, type, key);
    try {
        const content = await s3Storage.readFile(storageKey);
        return JSON.parse(content);
    } catch (error) {
        if (error.message === 'ENOENT') return null;
        throw error;
    }
}

async function writeData(projectId, type, data, key = null) {
    const storageKey = getStorageKey(projectId, type, key);
    await s3Storage.writeFile(storageKey, JSON.stringify(data, null, 2));
}

async function listProjects() {
    const keys = await s3Storage.listKeys('projects/');
    const projectIds = new Set();
    keys.forEach(key => {
        const match = key.match(/^projects\/([^\/]+)\//);
        if (match) projectIds.add(match[1]);
    });
    return Array.from(projectIds);
}

// Helper to convert Tiptap JSON to plain text
const tiptapToText = (doc) => {
    if (!doc || !doc.content) return '';
    let text = '';
    const walk = (node) => {
        if (node.type === 'text') text += node.text;
        if (node.type === 'hardBreak') text += '\n';
        if (node.type === 'horizontalRule') text += '\n---\n';
        if (node.type === 'paragraph') {
            if (node.content) node.content.forEach(walk);
            text += '\n\n';
        } else if (node.content) {
            node.content.forEach(walk);
        }
    };
    if (Array.isArray(doc.content)) doc.content.forEach(walk);
    return text.trim();
};

// --- Project Endpoints ---
app.get('/projects', async (req, res) => {
    try {
        const projectIds = await listProjects();
        const projects = await Promise.all(projectIds.map(async (id) => {
            const manifest = await readData(id, 'manifest');
            return {
                id,
                title: manifest?.title || id,
                description: manifest?.description || ''
            };
        }));
        res.json(projects);
    } catch (error) {
        console.error('Error listing projects:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/projects', async (req, res) => {
    try {
        const { id, title, description } = req.body;
        const manifest = {
            title: title || id,
            description: description || '',
            hierarchy: [{
                id: 'p1',
                type: 'part',
                title: 'Volume I',
                children: [{ id: '1', type: 'chapter', title: 'Chapter 1' }]
            }]
        };
        
        // Create initial chapter with proper Tiptap format
        const initialChapter = {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: []
                }
            ]
        };
        
        await writeData(id, 'manifest', manifest);
        await writeData(id, 'chapter', initialChapter, '1');
        await writeData(id, 'entity', []); // Empty array, not object
        
        res.json({ success: true, project: { id, title: manifest.title, description: manifest.description } });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/projects/:projectId', async (req, res) => {
    // Simplified - in production you'd delete all S3 objects for this project
    res.json({ success: true });
});

// --- Header-based routes (for frontend that uses x-project-id header) ---
app.get('/manifest', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        const manifest = await readData(projectId, 'manifest');
        if (!manifest) return res.status(404).json({ error: 'Manifest not found' });
        res.json(manifest);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/manifest', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        await writeData(projectId, 'manifest', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/content/:chapterId', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        const content = await readData(projectId, 'chapter', req.params.chapterId);
        if (!content) return res.status(404).json({ error: 'Not found' });
        res.json(content);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/content/:chapterId', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        await writeData(projectId, 'chapter', req.body, req.params.chapterId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/entities', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        const entities = await readData(projectId, 'entity');
        res.json(entities || { characters: [], places: [], institutions: [] });
    } catch (error) {
        res.status(500).json([]); // Empty list default
    }
});

app.post('/entities', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        await writeData(projectId, 'entity', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/entities/:entityId', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        const entity = await readData(projectId, 'entity', req.params.entityId);
        res.json(entity);
    } catch (error) {
        if (!entity) return res.status(404).json({ error: 'Entity profile not found' });
        res.status(500).json({ error: error.message });
    }
});

app.post('/entities/:entityId', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        await writeData(projectId, 'entity', req.body, req.params.entityId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/chat-history', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        const chat = await readData(projectId, 'chat');
        res.json(chat || { messages: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/chat-history', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        await writeData(projectId, 'chat', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/chat', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });
        
        const { messages, chapterContent, chapterTitle, selectedText, persona, currentChapterId, referencedEntityIds } = req.body;
        
        let systemPrompt = '';
        let tools = [];
        let loreContext = '';

        // Inject referenced entity/chapter context
        if (referencedEntityIds && Array.isArray(referencedEntityIds)) {
            for (const refId of referencedEntityIds) {
                const entityPath = `projects/${projectId}/entities/profiles/${refId}.json`;
                const chapterPath = `projects/${projectId}/chapters/${refId}.json`;

                const entityExists = await s3Storage.exists(entityPath);
                const chapterExists = await s3Storage.exists(chapterPath);

                if (entityExists) {
                    const profile = JSON.parse(await s3Storage.readFile(entityPath));
                    loreContext += `\n[Reference: ${profile.name} (${profile.type})]\n`;
                    loreContext += `Canon Facts: ${profile.canonicalFacts?.map(f => f.fact).join('. ')}\n`;
                    if (profile.timeline) {
                        const history = profile.timeline.map(t => `- Chapter ${t.chapterId}: ${t.status}`).join('\n');
                        loreContext += `Timeline History:\n${history}\n`;
                    }
                } else if (chapterExists) {
                    const content = JSON.parse(await s3Storage.readFile(chapterPath));
                    const text = tiptapToText(content);
                    loreContext += `\n[Reference: Chapter Content (${refId})]\n`;
                    loreContext += `Summary/Snippet: ${text.slice(0, 1000)}...\n`;
                }
            }
        }

        if (persona === 'archie') {
            systemPrompt = `You are Archie, the Demon of Literature. You are a demanding, eccentric, and enthusiastic editor.

You are currently reviewing Chapter "${chapterTitle}" with the author.

=== CURRENT CHAPTER CONTENT ===
${chapterContent || '(Empty chapter - no content yet)'}
=== END OF CHAPTER ===

${selectedText ? `The author has SELECTED this specific text for your attention:\n"${selectedText}"\n\n` : ''}
${loreContext ? `=== RELEVANT WORLD LORE (from @mentions) ===\n${loreContext}\n` : ''}

GUIDELINES:
- You have the FULL chapter content above. Analyze it, critique it, and provide specific feedback.
- When the author asks for your opinion, give concrete observations about what you see in the chapter.
- Be theatrical, demanding, and dramatic in your personality.
- Use tools whenever you want to suggest a change:
  * For structural overhaul (no breaks, poor pacing, or user requested rewrite), use reformat_chapter
  * For "finish this" or continuing the story, use append_text
  * For "rewrite this specific part", use patch_text
- SCENE BREAKS: Use '---' on its own line to indicate a scene break or section divider.
- If the chapter is empty or very short, acknowledge that and ask what the author wants to write about.`;

            tools = [
                {
                    type: "function",
                    function: {
                        name: "patch_text",
                        description: "Replace a specific segment of the story with new prose.",
                        parameters: {
                            type: "object",
                            properties: {
                                original: { type: "string", description: "The exact text to be replaced." },
                                suggested: { type: "string", description: "The new text to insert." }
                            },
                            required: ["original", "suggested"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "append_text",
                        description: "Add a new paragraph or segment to the end of the current chapter.",
                        parameters: {
                            type: "object",
                            properties: {
                                suggested: { type: "string", description: "The new text to append." }
                            },
                            required: ["suggested"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "reformat_chapter",
                        description: "Complete overhaul of the chapter structure (dialogue breaks, pacing, layout).",
                        parameters: {
                            type: "object",
                            properties: {
                                updated_content: { type: "string", description: "The entire new content for the chapter." }
                            },
                            required: ["updated_content"]
                        }
                    }
                }
            ];
        } else {
            // Roleplay as Entity
            const profilePath = `projects/${projectId}/entities/profiles/${persona}.json`;
            let profile = { name: persona, type: 'entity', canonicalFacts: [], timeline: [] };
            
            const profileExists = await s3Storage.exists(profilePath);
            if (profileExists) {
                profile = JSON.parse(await s3Storage.readFile(profilePath));
            }

            // Timeline Filtering (Shadow Context)
            const manifestPath = `projects/${projectId}/manifest.json`;
            let filteredTimeline = profile.timeline;
            let chapterIds = [];
            let currentIdx = -1;
            
            const manifestExists = await s3Storage.exists(manifestPath);
            if (manifestExists) {
                const manifest = JSON.parse(await s3Storage.readFile(manifestPath));
                chapterIds = [];
                manifest.hierarchy.forEach(p => p.children.forEach(c => chapterIds.push(c.id)));
                currentIdx = chapterIds.indexOf(currentChapterId);

                if (currentIdx !== -1) {
                    const validChapters = chapterIds.slice(0, currentIdx + 1);
                    filteredTimeline = profile.timeline.filter(t => validChapters.includes(t.chapterId));
                }
            }

            systemPrompt = `You are roleplaying as ${profile.name}, a ${profile.type} in the story.
          Current Chapter Being Viewed: "${chapterTitle}" (ID: ${currentChapterId})
          ${selectedText ? `User (The Author) has SELECTED this text to discuss with you: "${selectedText}"` : ''}
          
          CHARACTER BRAIN (Canonical Facts):
          ${profile.canonicalFacts
                    .filter(f => !f.chapterId || (currentIdx !== -1 && chapterIds.indexOf(f.chapterId) !== -1 && chapterIds.indexOf(f.chapterId) <= currentIdx))
                    .map(f => `- ${f.fact}`)
                    .join('\n')}
          
          TIMELINE HISTORY (Scoped to current chapter):
          ${filteredTimeline.map(t => `- Chapter ${t.chapterId}: ${t.status} (Motivation: ${t.motivation})`).join('\n')}

          ${loreContext ? `\nADDITIONAL CONTEXT (User explicitly mentioned these for this message):\n${loreContext}` : ''}
          
          IMPORTANT:
          - Stay strictly in character.
          - You DO NOT know anything that happens in chapters after Chapter ${currentChapterId}. This is critical to avoid spoilers.
          - Use the Author's prose style but speak as yourself.
          - If the Author asks for advice, answer from your character's perspective and desires.`;
        }

        // Non-streaming chat completion
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            tools: tools.length > 0 ? tools : undefined,
            stream: false,
        });

        const choice = completion.choices[0];
        const response = {
            content: choice.message.content || '',
            toolCalls: choice.message.tool_calls || []
        };

        res.json(response);
    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/sweep', async (req, res) => {
    try {
        const projectId = req.headers['x-project-id'];
        if (!projectId) return res.status(400).json({ error: 'x-project-id header required' });

        // Get manifest
        const manifest = await readData(projectId, 'manifest');
        if (!manifest) return res.status(404).json({ error: 'Manifest not found' });

        // Load sweep metadata (tracks processed chapters)
        const sweepMetaPath = `projects/${projectId}/sweeps/last_processed.json`;
        let sweepMeta = {};
        try {
            const content = await s3Storage.readFile(sweepMetaPath);
            sweepMeta = JSON.parse(content);
        } catch (error) {
            // File doesn't exist yet, start fresh
        }

        // Get all chapters
        const chapters = [];
        manifest.hierarchy.forEach(part => {
            part.children.forEach(node => {
                if (node.type === 'chapter') chapters.push(node);
            });
        });

        console.log(`[Sweep] Starting sweep for ${chapters.length} chapters in project: ${projectId}`);
        let scannedCount = 0;
        let skippedCount = 0;

        for (const chapter of chapters) {
            const chapterPath = `projects/${projectId}/chapters/${chapter.id}.json`;
            
            // Check if chapter exists
            const chapterExists = await s3Storage.exists(chapterPath);
            if (!chapterExists) continue;

            // For Lambda, we'll always process (no mtime checking in S3)
            // In production, you'd use S3 versioning or metadata
            
            const content = await readData(projectId, 'chapter', chapter.id);
            const text = tiptapToText(content);
            
            if (!text || text.trim().length === 0) {
                sweepMeta[chapter.id] = Date.now();
                continue;
            }

            console.log(`[Sweep] Scanning Chapter: ${chapter.title}`);
            scannedCount++;

            try {
                const response = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `You are the World Weaver. Extract all characters, places, and institutions from the following chapter.
For each entity, provide:
- Name (Clear and consistent)
- Type (character, place, or institution)
- Status (A brief summary of their actions or status in this chapter)
- Motivation (Their primary goal in this specific chapter)
- NewFacts (A list of short canonical facts revealed about them)

Return strictly valid JSON in this format:
{
  "entities": [
    { "name": "...", "type": "...", "status": "...", "motivation": "...", "newFacts": ["...", "..."] }
  ]
}`
                        },
                        { role: 'user', content: `Chapter Title: "${chapter.title}"\n\nContent:\n${text}` }
                    ],
                    response_format: { type: "json_object" }
                });

                const result = JSON.parse(response.choices[0].message.content);

                for (const extracted of result.entities) {
                    const id = extracted.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                    
                    // Load or create profile
                    let profile = await readData(projectId, 'entity', id);
                    if (!profile) {
                        profile = {
                            id,
                            name: extracted.name,
                            type: extracted.type,
                            canonicalFacts: [],
                            timeline: []
                        };
                    }

                    // Add new facts if not already present
                    extracted.newFacts.forEach(fact => {
                        const exists = profile.canonicalFacts.some(f => f.fact === fact);
                        if (!exists) {
                            profile.canonicalFacts.push({
                                fact: fact,
                                chapterId: chapter.id
                            });
                        }
                    });

                    // Update timeline for this chapter
                    const existingTimeline = profile.timeline.find(t => t.chapterId === chapter.id);
                    if (existingTimeline) {
                        existingTimeline.status = extracted.status;
                        existingTimeline.motivation = extracted.motivation;
                    } else {
                        profile.timeline.push({
                            chapterId: chapter.id,
                            chapterTitle: chapter.title,
                            status: extracted.status,
                            motivation: extracted.motivation
                        });
                    }

                    // Sort timeline by chapterId
                    profile.timeline.sort((a, b) => a.chapterId.localeCompare(b.chapterId, undefined, { numeric: true }));

                    // Save profile
                    await writeData(projectId, 'entity', profile, id);

                    // Update Master Index
                    let index = await readData(projectId, 'entity', null);
                    if (!index) index = [];
                    if (!index.find(e => e.id === id)) {
                        index.push({ id, name: profile.name, type: profile.type });
                        await writeData(projectId, 'entity', index, null);
                    }
                }

                // Mark as successfully processed
                sweepMeta[chapter.id] = Date.now();

            } catch (err) {
                console.error(`[Sweep] Failed to process chapter ${chapter.title}:`, err);
            }
        }

        // Save sweep metadata
        await s3Storage.writeFile(sweepMetaPath, JSON.stringify(sweepMeta, null, 2));

        res.json({ success: true, message: `Archie has finished weaving. Scanned: ${scannedCount}, Skipped: ${skippedCount}.` });
    } catch (error) {
        console.error('Sweep Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Path-based routes (legacy, keep for compatibility) ---
app.get('/manifest/:projectId', async (req, res) => {
    try {
        const manifest = await readData(req.params.projectId, 'manifest');
        res.json(manifest || { hierarchy: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/manifest/:projectId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'manifest', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Content Endpoints ---
app.get('/content/:projectId/:chapterId', async (req, res) => {
    try {
        const content = await readData(req.params.projectId, 'chapter', req.params.chapterId);
        res.json(content || { content: '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/content/:projectId/:chapterId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'chapter', req.body, req.params.chapterId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Entity Endpoints ---
app.get('/entities/:projectId', async (req, res) => {
    try {
        const entities = await readData(req.params.projectId, 'entity');
        res.json(entities || { characters: [], places: [], institutions: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/entities/:projectId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'entity', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/entities/:projectId/:entityId', async (req, res) => {
    try {
        const entity = await readData(req.params.projectId, 'entity', req.params.entityId);
        res.json(entity || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/entities/:projectId/:entityId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'entity', req.body, req.params.entityId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Chat Endpoints ---
app.post('/chat/:projectId', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (type, data) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const { messages, context } = req.body;
        const projectId = req.params.projectId;

        // Get chat history
        const chatHistory = await readData(projectId, 'chat') || { messages: [] };
        
        // Build system message with context
        let systemMessage = "You are Archie, the Demon of Literature, bound to this manuscript...";
        
        if (context?.currentChapter) {
            const chapterContent = await readData(projectId, 'chapter', context.currentChapter);
            if (chapterContent) {
                systemMessage += `\n\nCurrent Chapter Content:\n${chapterContent.content}`;
            }
        }

        if (context?.entities && context.entities.length > 0) {
            for (const entityId of context.entities) {
                const entity = await readData(projectId, 'entity', entityId);
                if (entity) {
                    systemMessage += `\n\nEntity @${entityId}:\n${JSON.stringify(entity, null, 2)}`;
                }
            }
        }

        const allMessages = [
            { role: 'system', content: systemMessage },
            ...messages
        ];

        const stream = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: allMessages,
            stream: true,
            temperature: 0.8,
        });

        let fullResponse = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                sendEvent('token', { content });
            }
        }

        // Save to history
        chatHistory.messages.push(...messages, { role: 'assistant', content: fullResponse });
        await writeData(projectId, 'chat', chatHistory);

        sendEvent('done', {});
        res.end();
    } catch (error) {
        console.error('Chat Error:', error);
        sendEvent('error', { message: error.message });
        res.end();
    }
});

app.get('/chat/:projectId', async (req, res) => {
    try {
        const chatHistory = await readData(req.params.projectId, 'chat');
        res.json(chatHistory || { messages: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Sweep Endpoints ---
app.post('/sweep/:projectId', async (req, res) => {
    try {
        const { chapterId, content } = req.body;
        const projectId = req.params.projectId;

        // Extract entities using OpenAI
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: 'You are a literary analyst. Extract all characters, places, and institutions from the text. Return JSON format: {characters: [{id, name, description, timeline}], places: [{id, name, description}], institutions: [{id, name, description}]}'
            }, {
                role: 'user',
                content: `Chapter ${chapterId}:\n\n${content}`
            }],
            response_format: { type: 'json_object' }
        });

        const extracted = JSON.parse(response.choices[0].message.content);
        
        // Merge with existing entities
        const currentEntities = await readData(projectId, 'entity') || { characters: [], places: [], institutions: [] };
        
        // Simple merge logic (in production, you'd want smarter deduplication)
        currentEntities.characters = [...currentEntities.characters, ...extracted.characters];
        currentEntities.places = [...currentEntities.places, ...extracted.places];
        currentEntities.institutions = [...currentEntities.institutions, ...extracted.institutions];

        await writeData(projectId, 'entity', currentEntities);
        
        // Save sweep result
        await writeData(projectId, 'sweep', { chapterId, extracted, timestamp: new Date().toISOString() }, chapterId);

        res.json({ success: true, extracted });
    } catch (error) {
        console.error('Sweep Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Export for Lambda or run locally
if (isLambda) {
    module.exports.handler = serverless(app);
} else {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`✨ Neyasbook Backend running on port ${PORT}`);
        console.log(`📚 Using local filesystem storage`);
    });
}
