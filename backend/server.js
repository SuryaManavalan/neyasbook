const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Mock Storage Path
const STORAGE_DIR = path.join(__dirname, 'storage');
const PROJECTS_DIR = path.join(STORAGE_DIR, 'projects');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR);

const getProjectDir = (projectId) => {
    const dir = path.join(PROJECTS_DIR, projectId);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
        fs.mkdirSync(path.join(dir, 'chapters'));
        fs.mkdirSync(path.join(dir, 'entities'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'entities', 'profiles'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'sweeps'), { recursive: true });
    } else {
        // Ensure subdirs exist for existing projects
        const dirs = ['chapters', 'entities', 'entities/profiles', 'sweeps'];
        dirs.forEach(d => {
            const p = path.join(dir, d);
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        });
    }
    return dir;
};

// Initialize default project if manifest.json exists in STORAGE_DIR (migration)
const migrationManifest = path.join(STORAGE_DIR, 'manifest.json');
if (fs.existsSync(migrationManifest)) {
    const defaultDir = getProjectDir('default');
    fs.renameSync(migrationManifest, path.join(defaultDir, 'manifest.json'));
    // Move chapters (best effort)
    const files = fs.readdirSync(STORAGE_DIR);
    files.forEach(f => {
        if (f.startsWith('chapter_')) {
            fs.renameSync(path.join(STORAGE_DIR, f), path.join(defaultDir, 'chapters', f.slice(8)));
        }
    });
}
// Ensure at least one project
if (fs.readdirSync(PROJECTS_DIR).length === 0) {
    getProjectDir('neyas-chronicles');
    fs.writeFileSync(path.join(PROJECTS_DIR, 'neyas-chronicles', 'manifest.json'), JSON.stringify({
        title: "Neya's Chronicles",
        description: "A dark gothic tale of a doctor running from his past.",
        hierarchy: [{ id: 'part_1', title: 'Volume I', children: [{ id: '1', title: 'Chapter 1' }] }]
    }, null, 2));
}

const getStoragePath = (projectId, key) => {
    const projectDir = getProjectDir(projectId);
    if (key === 'manifest') return path.join(projectDir, 'manifest.json');
    return path.join(projectDir, 'chapters', `${key.replace(/\//g, '_')}.json`);
};

const getEntityPath = (projectId, id) => {
    const projectDir = getProjectDir(projectId);
    if (!id) return path.join(projectDir, 'entities', 'index.json');
    return path.join(projectDir, 'entities', 'profiles', `${id}.json`);
};

// --- Project Endpoints ---

app.get('/projects', (req, res) => {
    const projects = fs.readdirSync(PROJECTS_DIR).map(id => {
        const manifestPath = path.join(PROJECTS_DIR, id, 'manifest.json');
        let title = id;
        let description = '';
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            title = manifest.title || id;
            description = manifest.description || '';
        }
        return { id, title, description };
    });
    res.json(projects);
});

app.post('/projects', (req, res) => {
    const { id, title, description } = req.body;
    const projectDir = getProjectDir(id);
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
    fs.writeFileSync(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    res.json({ success: true, project: { id, title: manifest.title, description: manifest.description } });
});

app.delete('/projects/:id', (req, res) => {
    const projectDir = path.join(PROJECTS_DIR, req.params.id);
    if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Project not found' });
    }
});

// --- Storage Endpoints ---

app.get('/manifest', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getStoragePath(projectId, 'manifest');
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.status(404).json({ error: 'Manifest not found' });
    }
});

app.post('/manifest', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getStoragePath(projectId, 'manifest');
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.get('/content/:id', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getStoragePath(projectId, req.params.id);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

app.post('/content/:id', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getStoragePath(projectId, req.params.id);
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
});

app.delete('/content/:id', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getStoragePath(projectId, req.params.id);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    res.json({ success: true });
});

// --- Entity Endpoints ---

app.get('/entities', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getEntityPath(projectId);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.json([]); // Empty list default
    }
});

app.get('/entities/:id', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const filePath = getEntityPath(projectId, req.params.id);
    if (fs.existsSync(filePath)) {
        res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } else {
        res.status(404).json({ error: 'Entity profile not found' });
    }
});

app.post('/entities/:id', (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const profilePath = getEntityPath(projectId, req.params.id);
    const indexPath = getEntityPath(projectId);

    // Save profile
    fs.writeFileSync(profilePath, JSON.stringify(req.body, null, 2));

    // Update index
    let index = [];
    if (fs.existsSync(indexPath)) {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
    const existing = index.find(e => e.id === req.params.id);
    if (!existing) {
        index.push({
            id: req.params.id,
            name: req.body.name,
            type: req.body.type
        });
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } else if (existing.name !== req.body.name || existing.type !== req.body.type) {
        existing.name = req.body.name;
        existing.type = req.body.type;
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }

    res.json({ success: true });
});

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

app.post('/sweep', async (req, res) => {
    const projectId = req.headers['x-project-id'] || 'default';
    const projectDir = getProjectDir(projectId);
    const manifestsPath = getStoragePath(projectId, 'manifest');
    const sweepMetaPath = path.join(projectDir, 'sweeps', 'last_processed.json');

    if (!fs.existsSync(manifestsPath)) return res.status(404).json({ error: 'Manifest not found' });
    const manifest = JSON.parse(fs.readFileSync(manifestsPath, 'utf-8'));

    let sweepMeta = {};
    if (fs.existsSync(sweepMetaPath)) {
        sweepMeta = JSON.parse(fs.readFileSync(sweepMetaPath, 'utf-8'));
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
        const chapterPath = getStoragePath(projectId, chapter.id);
        if (!fs.existsSync(chapterPath)) continue;

        const stats = fs.statSync(chapterPath);
        const mtime = stats.mtimeMs;

        // Skip if not modified
        if (sweepMeta[chapter.id] && sweepMeta[chapter.id] === mtime) {
            skippedCount++;
            continue;
        }

        const content = JSON.parse(fs.readFileSync(chapterPath, 'utf-8'));
        const text = tiptapToText(content);
        if (!text) {
            sweepMeta[chapter.id] = mtime; // Mark as processed/empty
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
                const profilePath = getEntityPath(projectId, id);

                let profile = {
                    id,
                    name: extracted.name,
                    type: extracted.type,
                    canonicalFacts: [],
                    timeline: []
                };

                if (fs.existsSync(profilePath)) {
                    profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
                }

                // Add new facts if not already present
                extracted.newFacts.forEach(fact => {
                    // Check if fact exists (ignoring chapterId for uniqueness check to avoid dupes)
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

                // Sort timeline by chapterId (assuming numeric or chronological order)
                profile.timeline.sort((a, b) => a.chapterId.localeCompare(b.chapterId, undefined, { numeric: true }));

                fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));

                // Update Master Index
                const indexPath = getEntityPath(projectId);
                let index = [];
                if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
                if (!index.find(e => e.id === id)) {
                    index.push({ id, name: profile.name, type: profile.type });
                    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
                }
            }

            // Mark as successfully processed
            sweepMeta[chapter.id] = mtime;

        } catch (err) {
            console.error(`[Sweep] Failed to process chapter ${chapter.title}:`, err);
        }
    }

    fs.writeFileSync(sweepMetaPath, JSON.stringify(sweepMeta, null, 2));
    res.json({ success: true, message: `Archie has finished weaving. Scanned: ${scannedCount}, Skipped: ${skippedCount}.` });
});

// --- Chat Endpoint (SSE Streaming) ---

// --- Chat History Management ---

app.get('/chat-history', (req, res) => {
    const projectId = req.headers['x-project-id'];
    if (!projectId) return res.status(400).json({ error: 'Missing x-project-id' });

    const chatPath = path.join(PROJECTS_DIR, projectId, 'chat.json');
    if (!fs.existsSync(chatPath)) {
        return res.json({ messages: [] });
    }
    const data = JSON.parse(fs.readFileSync(chatPath, 'utf8'));
    res.json(data);
});

app.post('/chat-history', (req, res) => {
    const projectId = req.headers['x-project-id'];
    const { messages, contextStartIndex } = req.body;
    if (!projectId) return res.status(400).json({ error: 'Missing x-project-id' });

    const chatPath = path.join(PROJECTS_DIR, projectId, 'chat.json');
    fs.writeFileSync(chatPath, JSON.stringify({ messages, contextStartIndex }, null, 2));
    res.json({ success: true });
});

app.post('/chat', async (req, res) => {
    const { messages, chapterContent, chapterTitle, selectedText, persona, currentChapterId, referencedEntityIds } = req.body;
    const projectId = req.headers['x-project-id'] || 'default';

    try {
        let systemPrompt = '';
        let tools = [];
        let loreContext = '';

        // Inject referenced entity/chapter context
        if (referencedEntityIds && Array.isArray(referencedEntityIds)) {
            for (const refId of referencedEntityIds) {
                const entityPath = path.join(PROJECTS_DIR, projectId, 'entities', 'profiles', `${refId}.json`);
                const chapterPath = path.join(PROJECTS_DIR, projectId, 'chapters', `${refId}.json`);

                if (fs.existsSync(entityPath)) {
                    const profile = JSON.parse(fs.readFileSync(entityPath, 'utf-8'));
                    loreContext += `\n[Reference: ${profile.name} (${profile.type})]\n`;
                    loreContext += `Canon Facts: ${profile.canonicalFacts?.map(f => typeof f === 'string' ? f : f.fact).join('. ')}\n`;
                    if (profile.timeline) {
                        const history = profile.timeline.map(t => `- Chapter ${t.chapterId}: ${t.status}`).join('\n');
                        loreContext += `Timeline History:\n${history}\n`;
                    }
                } else if (fs.existsSync(chapterPath)) {
                    const content = JSON.parse(fs.readFileSync(chapterPath, 'utf-8'));
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
            const profilePath = getEntityPath(projectId, persona);
            let profile = { name: persona, type: 'entity', canonicalFacts: [], timeline: [] };
            if (fs.existsSync(profilePath)) {
                profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
            }

            // Timeline Filtering (Shadow Context)
            const manifestPath = getStoragePath(projectId, 'manifest');
            let filteredTimeline = profile.timeline;
            let chapterIds = [];
            let currentIdx = -1;
            if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
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
                    .map(f => typeof f === 'string' ? `- ${f}` : `- ${f.fact}`)
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

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
