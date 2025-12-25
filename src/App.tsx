import React, { useState, useEffect, useRef } from 'react'
import { ChevronRight, MessageSquare, Settings, Menu, BookOpen, User, MapPin, Shield, Feather, Send, Sparkles, Trash2, History, RotateCcw, FileText, X } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import Editor from './components/Editor'
import SuggestionCard from './components/SuggestionCard'

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const tiptapToText = (doc: any): string => {
    if (!doc || !doc.content) return '';
    let text = '';
    const walk = (node: any) => {
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
    doc.content.forEach(walk);
    return text.trim();
};

const textToTiptap = (text: string): any => {
    if (!text) return { type: 'doc', content: [] };

    // Split by lines and group into paragraphs or HRs
    const lines = text.split('\n');
    const nodes: any[] = [];
    let currentParagraph: string[] = [];

    const flush = () => {
        if (currentParagraph.length > 0) {
            nodes.push({
                type: 'paragraph',
                content: [{ type: 'text', text: currentParagraph.join(' ') }]
            });
            currentParagraph = [];
        }
    };

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed === '---') {
            flush();
            nodes.push({ type: 'horizontalRule' });
        } else if (trimmed === '') {
            flush();
        } else {
            currentParagraph.push(trimmed);
        }
    });
    flush();

    return { type: 'doc', content: nodes };
};



export default function App() {
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [chatOpen, setChatOpen] = useState(true)
    const [persona, setPersona] = useState('archie')
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
    const [projects, setProjects] = useState<any[]>([])
    const [manifest, setManifest] = useState<any>(null)
    const [currentChapterId, setCurrentChapterId] = useState('1')
    const [content, setContent] = useState<any>(null)
    const [selectedText, setSelectedText] = useState('')
    const [lastActivityTime, setLastActivityTime] = useState(Date.now());

    const [messages, setMessages] = useState<{
        role: 'user' | 'assistant',
        content: string,
        personaId?: string,
        suggestion?: { original: string, suggested: string }
    }[]>([
        {
            role: 'assistant',
            content: "OMG Elias is finally moving! I love the 'shroud' imagery, it's so classic. But maybe his desperation needs to feel... heavier? Like, what does 'ruined' actually feel like in his gut?",
        }
    ])
    const [inputValue, setInputValue] = useState('')
    const [isThinking, setIsThinking] = useState(false)
    const [thinkingLines, setThinkingLines] = useState<string[]>([])
    const [showHistory, setShowHistory] = useState(false)
    const [isContentLoading, setIsContentLoading] = useState(false)
    const [contextStartIndex, setContextStartIndex] = useState(0)
    const [currentView, setCurrentView] = useState<'editor' | 'entities' | 'profile'>('editor')
    const [entities, setEntities] = useState<any[]>([])
    const [activeEntityType, setActiveEntityType] = useState<'character' | 'place' | 'institution'>('character')
    const [selectedEntityProfile, setSelectedEntityProfile] = useState<any | null>(null)
    const [mentionSearch, setMentionSearch] = useState('')
    const [mentionPosition, setMentionPosition] = useState<{ top: number, left: number } | null>(null)
    const [mentions, setMentions] = useState<{ id: string, name: string, type: string }[]>([])

    const API_BASE = 'http://localhost:3001'

    const scrollRef = useRef<HTMLDivElement>(null)
    const lastGreetedChapterId = useRef<string | null>(null)
    const titleRef = useRef<HTMLTextAreaElement>(null)

    const handleRemoveMention = (mentionId: string) => {
        const mention = mentions.find(m => m.id === mentionId);
        if (mention) {
            setMentions(prev => prev.filter(m => m.id !== mentionId));
            const newTextClean = inputValue.replace(new RegExp(`@${mention.name}\\s*`, 'g'), '');
            setInputValue(newTextClean);
        }
    };

    const handleChapterSelect = (id: string) => {
        if (id === currentChapterId && content && currentView === 'editor') return;
        setIsContentLoading(true);
        setContent(null);
        setCurrentChapterId(id);
        setCurrentView('editor');
    }

    const handleEntitySelect = (id: string | null, type?: 'character' | 'place' | 'institution') => {
        if (!id) {
            if (type) setActiveEntityType(type);
            setCurrentView('entities');
            setSelectedEntityProfile(null);
            return;
        }
        setIsContentLoading(true);
        fetch(`${API_BASE}/entities/${id}`, {
            headers: { 'x-project-id': currentProjectId! }
        })
            .then(res => res.json())
            .then(data => {
                setSelectedEntityProfile(data);
                setCurrentView('profile');
                setIsContentLoading(false);
            })
            .catch(err => {
                console.error('Failed to load entity profile:', err);
                setIsContentLoading(false);
            });
    }

    const runSweep = () => {
        if (!currentProjectId) return;
        setIsThinking(true);
        setThinkingLines(["Archie is sharpening his quill...", "Scanning the tapestry for new names...", "Consulting the Demon's library..."]);

        fetch(`${API_BASE}/sweep`, {
            method: 'POST',
            headers: { 'x-project-id': currentProjectId }
        })
            .then(res => res.json())
            .then(data => {
                console.log('Sweep finished:', data.message);
                setIsThinking(false);
                setThinkingLines([]);
                // Reload entities
                fetch(`${API_BASE}/entities`, { headers: { 'x-project-id': currentProjectId } })
                    .then(r => r.json())
                    .then(setEntities);
            })
            .catch(err => {
                console.error('Sweep failed:', err);
                setIsThinking(false);
                setThinkingLines([]);
            });
    }

    // Load projects
    useEffect(() => {
        fetch(`${API_BASE}/projects`)
            .then(res => res.json())
            .then(data => {
                setProjects(data);
                // Auto-select if only one or none selected
                if (data.length > 0 && !currentProjectId) {
                    // Don't auto-select yet, show library if null
                }
            })
            .catch(err => console.error('Failed to load projects:', err))
    }, [])

    // Load entity index
    useEffect(() => {
        if (!currentProjectId) return;
        fetch(`${API_BASE}/entities`, {
            headers: { 'x-project-id': currentProjectId }
        })
            .then(res => res.json())
            .then(data => setEntities(data))
            .catch(err => console.error('Failed to load entities:', err));
    }, [currentProjectId]);

    // Load manifest when project changes
    useEffect(() => {
        if (!currentProjectId) {
            setManifest(null);
            return;
        }
        fetch(`${API_BASE}/manifest`, {
            headers: { 'x-project-id': currentProjectId }
        })
            .then(res => res.json())
            .then(data => {
                setManifest(data);
                if (data.hierarchy?.[0]?.children?.[0]) {
                    handleChapterSelect(data.hierarchy[0].children[0].id);
                }
            })
            .catch(err => console.error('Failed to load manifest:', err))

        // Load chat history
        fetch(`${API_BASE}/chat-history`, {
            headers: { 'x-project-id': currentProjectId }
        })
            .then(res => res.json())
            .then(data => {
                if (data.messages && data.messages.length > 0) {
                    setMessages(data.messages);
                    setContextStartIndex(data.contextStartIndex || 0);
                } else {
                    setMessages([{
                        role: 'assistant',
                        content: "The Library is open. Tell me, Author... where shall we begin weaving today?"
                    }]);
                }
            })
            .catch(err => console.error('Failed to load chat history:', err));
    }, [currentProjectId])

    // Load content when chapter or project changes
    useEffect(() => {
        if (!currentProjectId || !currentChapterId) return;
        setIsContentLoading(true);
        fetch(`${API_BASE}/content/${currentChapterId}`, {
            headers: { 'x-project-id': currentProjectId }
        })
            .then(res => {
                if (!res.ok) throw new Error('Chapter not found');
                return res.json();
            })
            .then(data => {
                setContent(data);
                setIsContentLoading(false);
            })
            .catch(err => {
                console.error('Failed to load content:', err)
                setContent({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'New Chapter' }] }] })
                setIsContentLoading(false);
            })
    }, [currentChapterId, currentProjectId])

    // Debounced Save
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (content && currentChapterId && currentProjectId) {
                setLastActivityTime(Date.now()); // Mark activity on edit
                fetch(`${API_BASE}/content/${currentChapterId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-project-id': currentProjectId
                    },
                    body: JSON.stringify(content)
                }).catch(err => console.error('Failed to save content:', err))
            }
        }, 2000)
        return () => clearTimeout(timeout)
    }, [content, currentChapterId, currentProjectId])

    // Debounced Chat History Save
    useEffect(() => {
        if (!currentProjectId || messages.length === 0) return;
        const timeout = setTimeout(() => {
            fetch(`${API_BASE}/chat-history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': currentProjectId
                },
                body: JSON.stringify({ messages, contextStartIndex })
            }).catch(err => console.error('Failed to save chat history:', err));
        }, 1000);
        return () => clearTimeout(timeout);
    }, [messages, contextStartIndex, currentProjectId]);

    const updateChapterTitle = (id: string, newTitle: string) => {
        if (!manifest) return;
        const newManifest = { ...manifest };
        let found = false;
        newManifest.hierarchy.forEach((part: any) => {
            const chap = part.children.find((c: any) => c.id === id);
            if (chap) {
                chap.title = newTitle;
                found = true;
            }
        });

        if (found) {
            setManifest(newManifest);
            fetch(`${API_BASE}/manifest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': currentProjectId!
                },
                body: JSON.stringify(newManifest)
            }).catch(err => console.error('Failed to save manifest:', err));
        }
    }

    // Proactive Comment Logic
    const triggerProactiveComment = async (customPrompt: string) => {
        if (!currentProjectId || !currentChapterId || isThinking || persona !== 'archie') return;
        handleSend(customPrompt); // Reuse existing handleSend
    }

    // Inactivity Monitor
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastActivityTime > 5 * 60 * 1000) { // 5 minutes
                if (currentProjectId && currentChapterId && !isThinking && !isContentLoading && content) {
                    const text = tiptapToText(content);
                    const snippet = text.slice(0, 500);
                    triggerProactiveComment(`I haven't written anything in 5 minutes. Take a look at my current progress: "${snippet}". Give me a proactive comment, critique, or nudge to keep going.`);
                    setLastActivityTime(now); // Reset timer to prevent spamming
                }
            }
        }, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [lastActivityTime, currentProjectId, currentChapterId, isThinking, content]);

    const createNewProject = () => {
        const title = prompt("Book Title:");
        if (!title) return;
        const id = title.toLowerCase().replace(/\s+/g, '-');
        const description = prompt("Description (optional):") || "";

        fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, title, description })
        }).then(res => res.json())
            .then(data => {
                setProjects(prev => [...prev, data.project]);
                setCurrentProjectId(id);
            });
    }

    const addNewChapter = (parentId: string = 'p1', type: 'chapter' | 'note' = 'chapter') => {
        if (!manifest || !currentProjectId) return;
        const newId = Math.random().toString(36).substr(2, 9);
        const newManifest = { ...manifest };
        const part = newManifest.hierarchy.find((p: any) => p.id === parentId);
        if (part) {
            part.children.push({
                id: newId,
                type: type,
                title: type === 'chapter' ? `Chapter ${part.children.length + 1}` : `Note ${part.children.length + 1}`
            });
            setManifest(newManifest);
            fetch(`${API_BASE}/manifest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': currentProjectId
                },
                body: JSON.stringify(newManifest)
            }).then(() => {
                handleChapterSelect(newId);
            }).catch(err => console.error('Failed to save manifest:', err));
        }
    }

    const deleteProject = (projectId: string) => {
        if (!confirm(`Are you sure you want to delete this world? All chapters and notes will be lost forever.`)) return;

        fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(() => {
                setProjects(prev => prev.filter(p => p.id !== projectId));
                if (currentProjectId === projectId) setCurrentProjectId(null);
            })
            .catch(err => console.error('Failed to delete project:', err));
    }

    const deleteNode = (nodeId: string) => {
        if (!manifest || !currentProjectId) return;
        if (!confirm(`Tear this page from your book? This cannot be undone.`)) return;

        const newManifest = { ...manifest };
        let found = false;
        newManifest.hierarchy.forEach((part: any) => {
            const index = part.children.findIndex((c: any) => c.id === nodeId);
            if (index !== -1) {
                part.children.splice(index, 1);
                found = true;
            }
        });

        if (found) {
            setManifest(newManifest);
            // Delete content file (best effort)
            fetch(`${API_BASE}/content/${nodeId}`, {
                method: 'DELETE',
                headers: { 'x-project-id': currentProjectId }
            }).catch(err => console.warn('Could not delete content file:', err));

            // Save manifest
            fetch(`${API_BASE}/manifest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': currentProjectId
                },
                body: JSON.stringify(newManifest)
            }).then(() => {
                if (currentChapterId === nodeId) {
                    const firstChap = newManifest.hierarchy[0]?.children[0]?.id;
                    if (firstChap) handleChapterSelect(firstChap);
                }
            }).catch(err => console.error('Failed to save manifest:', err));
        }
    }

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, thinkingLines])

    const currentTitle = manifest?.hierarchy.flatMap((p: any) => p.children).find((c: any) => c.id === currentChapterId)?.title || '';

    useEffect(() => {
        if (titleRef.current) {
            titleRef.current.style.height = 'auto';
            titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
        }
    }, [currentTitle, currentChapterId]);

    // Greeting Effect - Removed in favor of silent context updates.
    useEffect(() => {
        if (!isContentLoading && content && currentChapterId && currentProjectId && !isThinking && lastGreetedChapterId.current !== currentChapterId) {
            lastGreetedChapterId.current = currentChapterId;
        }
    }, [currentChapterId, currentProjectId, content, isContentLoading, isThinking]);

    const handleSend = async (overridePrompt?: string) => {
        const rawMsg = overridePrompt || inputValue
        if (!rawMsg.trim()) return

        // Sanitize mentions: remove '@' prefix for natural reading, but keep the ID reference for the backend
        let cleanMsg = rawMsg;
        mentions.forEach(m => {
            cleanMsg = cleanMsg.replace(new RegExp(`@${m.name}\\b`, 'g'), m.name);
        });

        setMessages(prev => [...prev, { role: 'user', content: cleanMsg, personaId: persona }])

        // Capture mentions before clearing
        const currentMentions = [...mentions];
        setMentions([])
        if (!overridePrompt) setInputValue('')

        setIsThinking(true)
        setThinkingLines([])

        try {
            const activeMessages = messages.slice(contextStartIndex);
            const response = await fetch(`${API_BASE}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': currentProjectId!
                },
                body: JSON.stringify({
                    messages: [...activeMessages, { role: 'user', content: cleanMsg }],
                    chapterContent: tiptapToText(content),
                    chapterTitle: manifest?.hierarchy.flatMap((p: any) => p.children).find((c: any) => c.id === currentChapterId)?.title || 'Untitled',
                    selectedText,
                    persona,
                    currentChapterId,
                    referencedEntityIds: currentMentions.map(m => m.id)
                })
            })

            const reader = response.body?.getReader()
            if (!reader) return

            let assistantMsg = ''
            setMessages(prev => [...prev, { role: 'assistant', content: '', personaId: persona }])

            const decoder = new TextDecoder()
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6))
                            if (data.type === 'status') {
                                setIsThinking(true)
                                setThinkingLines(prev => [...new Set([...prev, data.message])])
                            } else if (data.type === 'content') {
                                setIsThinking(false)
                                assistantMsg += data.delta
                                setMessages(prev => {
                                    if (prev.length === 0) return prev;
                                    const next = [...prev]
                                    const last = next[next.length - 1]
                                    if (last.role === 'assistant') {
                                        last.content = assistantMsg
                                    }
                                    return next
                                })
                            } else if (data.type === 'tool_call') {
                                setMessages(prev => {
                                    const next = [...prev]
                                    const last = next[next.length - 1]
                                    if (last.role === 'assistant') {
                                        try {
                                            const args = JSON.parse(data.arguments);
                                            if (data.name === 'patch_text') {
                                                last.suggestion = { original: args.original, suggested: args.suggested };
                                            } else if (data.name === 'append_text') {
                                                last.suggestion = { original: '', suggested: args.suggested };
                                            } else if (data.name === 'reformat_chapter') {
                                                last.suggestion = { original: 'FULL_CHAPTER_REFORMAT', suggested: args.updated_content };
                                            }
                                        } catch (e) {
                                            // Arguments still streaming or malformed
                                        }
                                    }
                                    return next
                                })
                            }
                        } catch (e) {
                            // Incomplete JSON chunk
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Chat Error:', error)
            setMessages(prev => [...prev, { role: 'assistant', content: 'The Demon is currently unavailable. Try again later.' }])
        } finally {
            setIsThinking(false)
            setThinkingLines([])
        }
    }

    const onAcceptSuggestion = (original: string, suggested: string) => {
        if (!content) {
            console.error("No content to patch!");
            return;
        }

        const newContent = JSON.parse(JSON.stringify(content));
        if (!newContent.content) newContent.content = [];

        let applied = false;

        // --- REFORMAT CASE ---
        if (original === 'FULL_CHAPTER_REFORMAT') {
            if (!suggested || !suggested.trim()) {
                alert("Archie's reformat suggestion is empty! Keeping original text.");
                return;
            }
            if (confirm("Archie has suggested a structural overhaul. Replace this entire chapter?")) {
                setContent(textToTiptap(suggested));
                return;
            } else {
                return;
            }
        }

        if (!original && suggested) {
            // It's an Append
            const newNodes = textToTiptap(suggested).content;
            newContent.content.push(...newNodes);
            applied = true;
        } else {
            // It's a Patch (Replacement)
            const replaceInNode = (node: any) => {
                if (node.text) {
                    // Exact match first
                    if (node.text.includes(original)) {
                        node.text = node.text.replace(original, suggested);
                        applied = true;
                    }
                    // Fallback: try matching with normalized whitespace
                    else if (node.text.replace(/\s+/g, ' ').includes(original.replace(/\s+/g, ' '))) {
                        const normalizedText = node.text.replace(/\s+/g, ' ');
                        const normalizedOriginal = original.replace(/\s+/g, ' ');
                        node.text = normalizedText.replace(normalizedOriginal, suggested);
                        applied = true;
                    }
                }
                if (node.content) {
                    node.content.forEach(replaceInNode);
                }
            }
            replaceInNode(newContent);
        }

        if (applied) {
            setContent(newContent);
        } else {
            console.warn("Could not find original text to patch. Content might have changed.");
            alert("Archie's patch failed! The target text seems to have shifted or vanished.");
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;
        setInputValue(value);

        // Auto-resize
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';

        // Detect @ mention trigger
        // Detect @ mention trigger
        const lastAt = value.lastIndexOf('@', cursorPosition - 1);
        if (lastAt !== -1 && (lastAt === 0 || value[lastAt - 1] === ' ')) {
            const query = value.slice(lastAt + 1, cursorPosition);
            if (!query.includes(' ')) {
                setMentionSearch(query);
                setMentionPosition({ top: -200, left: 20 });
            } else {
                setMentionPosition(null);
            }
        } else {
            setMentionPosition(null);
        }

        // Sync mentions (remove if deleted)
        setMentions(prev => prev.filter(m => value.includes(`@${m.name}`)));
    };

    const handleMentionSelect = (entity: any) => {
        const lastAt = inputValue.lastIndexOf('@');
        const newValue = inputValue.slice(0, lastAt) + `@${entity.name} ` + inputValue.slice(lastAt + mentionSearch.length + 1);
        setInputValue(newValue);
        setMentions(prev => [...prev, { id: entity.id, name: entity.name, type: entity.type || 'chapter' }]);
        setMentionPosition(null);
    };

    if (!currentProjectId) {
        return <LibraryView projects={projects} onSelect={setCurrentProjectId} onCreate={createNewProject} onDelete={deleteProject} />
    }

    return (
        <div className="flex h-screen w-full bg-paper overflow-hidden text-ink paper-texture">
            {/* Sidebar Navigation */}
            <aside
                className={cn(
                    "transition-all duration-300 border-r border-ink/5 flex flex-col bg-white/30 backdrop-blur-sm z-20",
                    sidebarOpen ? "w-64" : "w-16"
                )}
            >
                <div className="p-6 flex items-center justify-between border-b border-ink/5 bg-paper/50">
                    {sidebarOpen && (
                        <h1 className="font-display font-semibold text-2xl tracking-tight bg-gradient-to-r from-ink to-ink/70 bg-clip-text text-transparent">
                            Neyasbook
                        </h1>
                    )}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-1.5 hover:bg-ink/5 rounded-full transition-colors text-ink/40 hover:text-ink"
                    >
                        {sidebarOpen ? <Menu size={20} /> : <BookOpen size={20} />}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {sidebarOpen ? (
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-ink/40">Manuscript</div>
                                {manifest?.hierarchy.map((part: any) => (
                                    <div key={part.id} className="space-y-1">
                                        <div className="flex items-center justify-between group/part">
                                            <NavItem icon={<BookOpen size={18} />} label={part.title} />
                                            <button
                                                onClick={() => addNewChapter(part.id, part.id === 'p1' ? 'chapter' : 'note')}
                                                className="opacity-0 group-hover/part:opacity-100 p-1 hover:bg-ink/5 rounded transition-all text-ink/40 hover:text-accent mr-2"
                                                title="Add New"
                                            >
                                                <Feather size={14} />
                                            </button>
                                        </div>
                                        <div className="pl-4 space-y-1 border-l border-ink/5 ml-2">
                                            {part.children.map((node: any) => (
                                                <div key={node.id} className="group/node relative">
                                                    <NavItem
                                                        label={node.title}
                                                        active={currentChapterId === node.id}
                                                        secondary
                                                        onClick={() => handleChapterSelect(node.id)}
                                                    />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/node:opacity-100 p-1 hover:text-red-500 transition-all text-ink/20"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-1 pt-4">
                                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-ink/40 flex justify-between items-center">
                                    <span>World Atlas</span>
                                    <button
                                        onClick={runSweep}
                                        className="text-accent hover:text-accent/80 transition-colors"
                                        title="Sync World (Sweep)"
                                    >
                                        <Sparkles size={12} />
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    <NavItem
                                        icon={<User size={18} />}
                                        label="Characters"
                                        active={(currentView === 'entities' || currentView === 'profile') && activeEntityType === 'character'}
                                        onClick={() => handleEntitySelect(null, 'character')}
                                    />
                                    <NavItem
                                        icon={<MapPin size={18} />}
                                        label="Settings"
                                        active={(currentView === 'entities' || currentView === 'profile') && activeEntityType === 'place'}
                                        onClick={() => handleEntitySelect(null, 'place')}
                                    />
                                    <NavItem
                                        icon={<Shield size={18} />}
                                        label="Institutions"
                                        active={(currentView === 'entities' || currentView === 'profile') && activeEntityType === 'institution'}
                                        onClick={() => handleEntitySelect(null, 'institution')}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-6 py-4">
                            <BookOpen size={20} className="text-ink/60 hover:text-ink cursor-pointer" />
                            <User size={20} className="text-ink/60 hover:text-ink cursor-pointer" />
                            <MapPin size={20} className="text-ink/60 hover:text-ink cursor-pointer" />
                            <Shield size={20} className="text-ink/60 hover:text-ink cursor-pointer" />
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-ink/5">
                    <button className="flex items-center gap-3 w-full p-2 hover:bg-ink/5 rounded transition-colors">
                        <Settings size={18} />
                        {sidebarOpen && <span>Settings</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-white/40">
                {/* Breadcrumbs */}
                <header className="h-16 border-b border-ink/5 flex items-center px-8 gap-3 text-[13px] text-ink/50 bg-white/60 backdrop-blur-md z-10 font-sans tracking-wide">
                    <span
                        className="hover:text-accent cursor-pointer transition-colors uppercase font-bold text-[10px] tracking-widest"
                        onClick={() => setCurrentProjectId(null)}
                    >
                        Workspaces
                    </span>
                    <ChevronRight size={14} className="text-ink/10" />
                    <span className="hover:text-accent cursor-pointer transition-colors font-medium">
                        {manifest?.title || 'Loading Story...'}
                    </span>
                    <ChevronRight size={14} className="text-ink/10" />
                    <span className="text-ink font-display text-lg italic pr-4">
                        {(() => {
                            if (!manifest) return '...';
                            for (const part of manifest.hierarchy) {
                                const chapter = part.children.find((c: any) => c.id === currentChapterId);
                                if (chapter) return chapter.title;
                            }
                            return '...';
                        })()}
                    </span>
                    <div className="ml-auto w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.4)]" />
                </header>

                {/* Content Rendering Switcher */}
                <div className="flex-1 overflow-y-auto px-12 py-16 flex justify-center">
                    <div className="max-w-3xl w-full">
                        {currentView === 'editor' && (
                            <>
                                <div className="mb-12">
                                    <textarea
                                        ref={titleRef}
                                        value={currentTitle}
                                        onChange={(e) => {
                                            updateChapterTitle(currentChapterId, e.target.value);
                                        }}
                                        rows={1}
                                        className="w-full bg-transparent border-none focus:outline-none font-display text-6xl italic text-ink/90 tracking-tight placeholder:text-ink/10 resize-none overflow-hidden leading-tight break-words whitespace-pre-wrap"
                                        placeholder="Chapter Title..."
                                    />
                                    <div className="h-px w-24 bg-accent/30 mt-4" />
                                </div>
                                <Editor
                                    content={content}
                                    onChange={setContent}
                                    onSelectionChange={setSelectedText}
                                />
                            </>
                        )}

                        {currentView === 'entities' && (
                            <EntityDirectory
                                entities={entities}
                                filterType={activeEntityType}
                                onSelect={handleEntitySelect}
                            />
                        )}

                        {currentView === 'profile' && selectedEntityProfile && (
                            <EntityProfileView
                                profile={selectedEntityProfile}
                                onBack={() => handleEntitySelect(null)}
                                onSave={(p) => {
                                    fetch(`${API_BASE}/entities/${p.id}`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'x-project-id': currentProjectId!
                                        },
                                        body: JSON.stringify(p)
                                    }).then(() => setSelectedEntityProfile(p));
                                }}
                            />
                        )}
                    </div>
                </div>
            </main>

            {/* Right AI Panel (Archie) */}
            <aside
                className={cn(
                    "transition-all duration-300 border-l border-ink/5 flex flex-col bg-white/50 backdrop-blur-md z-20 overflow-hidden",
                    chatOpen ? "w-96" : "w-12"
                )}
            >
                <div className="p-4 border-b border-ink/5 bg-white/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between min-h-[73px]">
                    {chatOpen ? (
                        <>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-ink text-paper flex items-center justify-center font-display italic text-sm shadow-md">
                                    {persona === 'archie' ? 'A' : (entities.find(e => e.id === persona)?.name?.[0] || 'E')}
                                </div>
                                <div>
                                    <select
                                        value={persona}
                                        onChange={(e) => setPersona(e.target.value)}
                                        className="bg-transparent font-display font-semibold text-sm leading-tight focus:outline-none cursor-pointer appearance-none"
                                    >
                                        <option value="archie">Archie</option>
                                        <optgroup label="Characters">
                                            {entities.filter(e => e.type === 'character').map(e => (
                                                <option key={e.id} value={e.id}>{e.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Settings">
                                            {entities.filter(e => e.type !== 'character').map(e => (
                                                <option key={e.id} value={e.id}>{e.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                    <p className="text-[9px] text-ink/40 uppercase tracking-tighter">
                                        {persona === 'archie' ? 'Demon of Literature' : (entities.find(e => e.id === persona)?.type || 'Entity Simulacrum')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {contextStartIndex > 0 && (
                                    <button
                                        onClick={() => setShowHistory(!showHistory)}
                                        title={showHistory ? "Hide History" : "Show History"}
                                        className={cn("p-1.5 rounded-md transition-all hover:bg-ink/5", showHistory ? "text-accent bg-accent/5" : "text-ink/30")}
                                    >
                                        <History size={16} />
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (confirm("Reset Archie's short-term memory? Old messages will be archived.")) {
                                            setContextStartIndex(messages.length);
                                        }
                                    }}
                                    title="Clear Context"
                                    className="p-1.5 rounded-md text-ink/30 hover:text-accent hover:bg-accent/5 transition-all"
                                >
                                    <RotateCcw size={16} />
                                </button>
                                <button
                                    onClick={() => setChatOpen(false)}
                                    className="p-1.5 rounded-md text-ink/20 hover:text-ink/40 transition-all ml-1"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            onClick={() => setChatOpen(true)}
                            className="w-full h-full flex justify-center py-4 text-ink/20 hover:text-ink/40 transition-all"
                        >
                            <MessageSquare size={20} />
                        </button>
                    )}
                </div>

                {chatOpen && (
                    <>
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
                        >
                            {(showHistory ? messages : messages.slice(contextStartIndex))
                                .filter(msg => !persona || msg.personaId === persona)
                                .map((msg, idx) => (
                                    <React.Fragment key={idx}>
                                        {messages.indexOf(msg) === contextStartIndex && contextStartIndex > 0 && (
                                            <div className="flex items-center gap-4 py-2">
                                                <div className="h-px flex-1 bg-ink/10" />
                                                <span className="text-[10px] uppercase tracking-widest text-ink/30 font-bold bg-white/50 px-2 rounded-full">New Context</span>
                                                <div className="h-px flex-1 bg-ink/10" />
                                            </div>
                                        )}
                                        <ChatMessage
                                            role={msg.role}
                                            content={msg.content}
                                            personaId={msg.personaId}
                                            entities={entities}
                                            suggestion={msg.suggestion}
                                            onAcceptSuggestion={() => msg.suggestion && onAcceptSuggestion(msg.suggestion.original, msg.suggestion.suggested)}
                                        />
                                    </React.Fragment>
                                ))}

                            {isThinking && (
                                <div className="mr-auto max-w-[85%] space-y-2">
                                    <div className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center animate-pulse">
                                        <Sparkles size={14} className="text-accent" />
                                    </div>
                                    {thinkingLines.map((line, i) => (
                                        <p key={i} className="text-[10px] text-ink/30 italic font-serif flex items-center gap-2 animate-in fade-in slide-in-from-left-2 transition-all">
                                            <span className="w-1 h-1 rounded-full bg-accent/40" /> {line}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-white/80 backdrop-blur-md border-t border-ink/5">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    handleSend()
                                }}
                                className="relative flex flex-col gap-2"
                            >
                                {mentions.length > 0 && (
                                    <div className="flex flex-wrap gap-2 px-2">
                                        {mentions.map((m) => (
                                            <span key={m.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] bg-accent/5 text-accent border border-accent/20 font-bold uppercase tracking-wider animate-in fade-in zoom-in duration-200">
                                                {m.type === 'character' ? <User size={10} /> : m.type === 'place' ? <MapPin size={10} /> : m.type === 'chapter' ? <FileText size={10} /> : <Shield size={10} />}
                                                {m.name}
                                                <button
                                                    onClick={() => handleRemoveMention(m.id)}
                                                    className="ml-1 hover:text-red-500 transition-colors"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="relative w-full flex items-center">
                                    {mentionPosition && (
                                        <MentionDropdown
                                            query={mentionSearch}
                                            entities={entities}
                                            manifest={manifest}
                                            onSelect={handleMentionSelect}
                                            onClose={() => setMentionPosition(null)}
                                        />
                                    )}
                                    <textarea
                                        value={inputValue}
                                        onChange={handleInputChange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSend()
                                            }
                                            if (e.key === 'Escape') setMentionPosition(null);
                                        }}
                                        placeholder={persona === 'archie' ? "Whisper to the Demon..." : `Speak with ${entities.find(e => e.id === persona)?.name || 'the entity'}...`}
                                        className="w-full bg-ink/5 border-none rounded-2xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-accent/20 resize-none max-h-40 font-serif placeholder:italic shadow-inner"
                                        rows={1}
                                        style={{ height: 'auto' }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!inputValue.trim() || isThinking}
                                        className="absolute right-2 p-2 text-accent hover:text-accent/80 disabled:text-ink/10 transition-colors"
                                    >
                                        <Send size={18} />
                                    </button>
                                </div>
                            </form>
                            <p className="text-[8px] text-center text-ink/20 mt-2 uppercase tracking-widest font-bold">
                                Shift + Enter for new line
                            </p>
                        </div>
                    </>
                )}
            </aside>

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-progress {
          animation: progress 2s infinite linear;
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .prose hr {
          border: none;
          border-top: 1px solid rgba(212, 175, 55, 0.2);
          margin: 4em auto;
          overflow: visible;
          text-align: center;
          width: 50%;
        }
        .prose hr::after {
          content: '◈ ◈ ◈';
          display: inline-block;
          position: relative;
          top: -0.8em;
          padding: 0 1.5em;
          background: #FBF9F4;
          color: #D4AF37;
          font-size: 1.1em;
          letter-spacing: 0.8em;
          font-variant: small-caps;
        }
      `}} />
        </div>
    )
}

function NavItem({ icon, label, active, secondary, onClick }: {
    icon?: React.ReactNode,
    label: string,
    active?: boolean,
    secondary?: boolean,
    onClick?: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2.5 w-full p-2.5 rounded-lg transition-all duration-300 text-left group",
                active
                    ? "bg-accent/10 text-ink font-semibold shadow-sm border border-accent/10 ring-1 ring-accent/5"
                    : "hover:bg-ink/5 text-ink/50 hover:text-ink",
                secondary && "text-[13px] py-1.5 ml-1 font-serif italic"
            )}
        >
            {icon && (
                <span className={cn(
                    "transition-colors duration-300",
                    active ? "text-accent" : "text-ink/20 group-hover:text-ink/40"
                )}>
                    {icon}
                </span>
            )}
            <span className="truncate">{label}</span>
            {active && !secondary && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(212,175,55,0.4)]" />
            )}
        </button>
    )
}

function MentionDropdown({ query, entities, manifest, onSelect, onClose }: {
    query: string,
    entities: any[],
    manifest: any,
    onSelect: (item: any) => void,
    onClose: () => void
}) {
    const chapters = manifest?.hierarchy.flatMap((p: any) => p.children.map((c: any) => ({ ...c, type: 'chapter' }))) || [];
    const allItems = [...entities, ...chapters.map((c: any) => ({ ...c, name: c.title }))];
    const filtered = allItems.filter(item =>
        (item.name || item.title)?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);

    if (filtered.length === 0) return null;

    return (
        <div className="absolute bottom-full left-4 mb-2 w-64 bg-white border border-ink/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="px-3 py-1.5 bg-ink/5 text-[9px] font-bold uppercase tracking-widest text-ink/30 border-b border-ink/5">Refining Context...</div>
            <div className="max-h-60 overflow-y-auto no-scrollbar">
                {filtered.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onSelect({ id: item.id, name: item.name || item.title, type: item.type })}
                        className="w-full px-4 py-2.5 text-left hover:bg-accent/5 flex items-center gap-3 transition-colors border-b border-ink/[0.02] last:border-none"
                    >
                        <div className="w-6 h-6 rounded-full bg-ink/5 flex items-center justify-center text-accent/60">
                            {item.type === 'character' ? <User size={12} /> : item.type === 'place' ? <MapPin size={12} /> : item.type === 'chapter' ? <FileText size={12} /> : <Shield size={12} />}
                        </div>
                        <div>
                            <p className="text-sm font-display italic text-ink">{item.name || item.title}</p>
                            <p className="text-[8px] uppercase tracking-tighter text-ink/30">{item.type}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ChatMessage({ role, content, personaId, entities, suggestion, onAcceptSuggestion }: {
    role: 'user' | 'assistant',
    content: string,
    personaId?: string,
    entities?: any[],
    suggestion?: { original: string, suggested: string },
    onAcceptSuggestion?: () => void
}) {
    const personaName = personaId === 'archie' || !personaId
        ? 'The Demon'
        : entities?.find(e => e.id === personaId)?.name || 'Someone...';

    return (
        <div className={cn("flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-400", role === 'user' ? "items-end" : "items-start")}>
            <div className={cn(
                "max-w-[85%] p-3.5 rounded-2xl text-[13px] leading-relaxed shadow-sm transition-all",
                role === 'user'
                    ? "bg-ink text-paper rounded-tr-none font-medium"
                    : "bg-white border border-ink/10 rounded-tl-none font-serif text-sm italic"
            )}>
                <p className="whitespace-pre-wrap">{content}</p>
            </div>

            {suggestion && (
                <div className="w-full mt-2">
                    <SuggestionCard
                        original={suggestion.original}
                        suggested={suggestion.suggested}
                        onAccept={onAcceptSuggestion || (() => { })}
                        onReject={() => { }}
                    />
                </div>
            )}

            <span className="text-[9px] uppercase tracking-widest text-ink/20 font-bold px-1">
                {role === 'user' ? 'Author' : personaName}
            </span>
        </div>
    )
}

function EntityDirectory({ entities, filterType, onSelect }: { entities: any[], filterType: string, onSelect: (id: string) => void }) {
    const filtered = entities.filter(e => e.type === filterType);
    const title = filterType === 'character' ? 'Characters' : filterType === 'place' ? 'Settings' : 'Institutions';
    const sub = filterType === 'character' ? 'The souls that inhabit your world.' : filterType === 'place' ? 'The stages where your drama unfolds.' : 'The forces that shape your society.';

    return (
        <div className="space-y-12">
            <header className="space-y-4">
                <h1 className="font-display text-5xl italic text-ink tracking-tight">{title}</h1>
                <p className="font-serif text-lg text-ink/40">{sub}</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filtered.length === 0 && (
                    <div className="col-span-2 py-20 text-center border-2 border-dashed border-ink/5 rounded-2xl">
                        <p className="font-serif italic text-ink/30">Archie hasn't found any {title.toLowerCase()} yet. Click the Sparkles in the sidebar to sweep your story.</p>
                    </div>
                )}
                {filtered.map(e => (
                    <div
                        key={e.id}
                        onClick={() => onSelect(e.id)}
                        className="group bg-white border border-ink/5 rounded-xl p-6 cursor-pointer hover:border-accent/40 hover:shadow-xl transition-all duration-300"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-ink/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                                {e.type === 'character' ? <User size={24} /> : e.type === 'place' ? <MapPin size={24} /> : <Shield size={24} />}
                            </div>
                            <div>
                                <h3 className="font-display text-2xl italic text-ink">{e.name}</h3>
                                <p className="text-[10px] uppercase tracking-widest text-ink/30">{e.type}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EntityProfileView({ profile, onBack, onSave }: { profile: any, onBack: () => void, onSave: (p: any) => void }) {
    const [localProfile, setLocalProfile] = useState(profile);

    const updateCanon = (facts: string[]) => {
        const newP = { ...localProfile, canonicalFacts: facts };
        setLocalProfile(newP);
        onSave(newP);
    };

    return (
        <div className="space-y-12">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-ink/40 hover:text-ink transition-colors"
            >
                <ChevronRight size={14} className="rotate-180" /> Back to Directory
            </button>

            <header className="flex items-center gap-8">
                <div className="w-24 h-24 rounded-2xl bg-white border border-ink/5 flex items-center justify-center text-accent shadow-sm">
                    {localProfile.type === 'character' ? <User size={48} /> : localProfile.type === 'place' ? <MapPin size={48} /> : <Shield size={48} />}
                </div>
                <div>
                    <h1 className="font-display text-5xl italic text-ink tracking-tight">{localProfile.name}</h1>
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-accent mt-2">{localProfile.type}</p>
                </div>
            </header>

            <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-ink/5 pb-2">
                    <h2 className="font-display text-2xl italic text-ink">Canonical Facts</h2>
                    <Sparkles size={16} className="text-accent/40" />
                </div>
                <div className="space-y-3">
                    {localProfile.canonicalFacts?.map((fact: string, i: number) => (
                        <div key={i} className="flex gap-3 text-serif text-ink/70 leading-relaxed">
                            <span className="text-accent">•</span>
                            <p>{fact}</p>
                        </div>
                    ))}
                    <button
                        onClick={() => {
                            const fact = prompt("New Canon Fact:");
                            if (fact) updateCanon([...(localProfile.canonicalFacts || []), fact]);
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-accent hover:text-accent/80 transition-colors mt-4"
                    >
                        + Add Canon Fact
                    </button>
                </div>
            </section>

            <section className="space-y-6">
                <h2 className="font-display text-2xl italic text-ink border-b border-ink/5 pb-2">Timeline History</h2>
                <div className="space-y-8 relative pl-6 border-l border-ink/5 ml-1">
                    {localProfile.timeline?.map((entry: any, i: number) => (
                        <div key={i} className="relative">
                            <div className="absolute -left-[29px] top-2 w-2 h-2 rounded-full bg-accent ring-4 ring-paper" />
                            <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-ink/20">Chapter: {entry.chapterId}</p>
                                <p className="font-serif italic text-ink/50 text-sm">"{entry.motivation}"</p>
                                <p className="text-serif text-ink/80 leading-relaxed">{entry.status}</p>
                            </div>
                        </div>
                    ))}
                    {(!localProfile.timeline || localProfile.timeline.length === 0) && (
                        <p className="font-serif italic text-ink/30 text-center py-8">No specific timeline entries recorded yet.</p>
                    )}
                </div>
            </section>
        </div>
    );
}

function LibraryView({ projects, onSelect, onCreate, onDelete }: { projects: any[], onSelect: (id: string) => void, onCreate: () => void, onDelete: (id: string) => void }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-paper/50 paper-texture overflow-y-auto w-full">
            <div className="max-w-5xl w-full space-y-12">
                <header className="text-center space-y-4">
                    <h1 className="font-display text-7xl italic text-ink tracking-tight">Neyasbook</h1>
                    <p className="font-serif text-xl text-ink/40">Select a workspace to begin weaving your tapestry.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-12">
                    {projects.map(p => (
                        <div
                            key={p.id}
                            className="group bg-white border border-ink/5 rounded-2xl p-8 space-y-6 cursor-pointer hover:border-accent/40 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 relative overflow-hidden"
                            onClick={() => onSelect(p.id)}
                        >
                            <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                                    className="p-2 hover:bg-red-50 text-ink/20 hover:text-red-500 rounded-full transition-all"
                                    title="Burn Manuscript"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <ChevronRight className="text-accent self-center" />
                            </div>
                            <div className="w-12 h-12 rounded-full bg-ink/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                                <BookOpen size={24} />
                            </div>
                            <div className="space-y-2">
                                <h2 className="font-display text-3xl italic text-ink">{p.title}</h2>
                                <p className="font-serif text-sm text-ink/50 line-clamp-3 leading-relaxed">
                                    {p.description || "The ink is still fresh on this world. No summary has been written yet."}
                                </p>
                            </div>
                            <div className="pt-4 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-ink/20 group-hover:text-accent/60 transition-colors">
                                <span>Recent Edition</span>
                                <div className="h-px flex-1 bg-ink/5" />
                                <span>Dec 25</span>
                            </div>
                        </div>
                    ))}

                    <div
                        onClick={onCreate}
                        className="border-2 border-dashed border-ink/10 rounded-2xl p-8 flex flex-col items-center justify-center space-y-4 hover:border-accent/40 hover:bg-accent/5 transition-all cursor-pointer group min-h-[250px]"
                    >
                        <div className="w-12 h-12 rounded-full bg-ink/5 flex items-center justify-center text-ink/20 group-hover:text-accent transition-colors">
                            <Feather size={24} />
                        </div>
                        <span className="font-sans font-bold text-xs uppercase tracking-widest text-ink/20 group-hover:text-accent">Weave New World</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
