export interface BookManifest {
    id: string;
    title: string;
    hierarchy: FolderNode[];
}

export interface FolderNode {
    id: string;
    type: 'part' | 'chapter' | 'section';
    title: string;
    children?: FolderNode[];
}

export interface ChapterDoc {
    id: string;
    bookId: string;
    title: string;
    content: any; // Tiptap JSON
    lastSweepVersion: number;
}

export interface EntityProfile {
    id: string;
    type: 'character' | 'place' | 'institution' | 'object';
    name: string;
    canonicalFacts: string[];
    timeline: {
        chapterId: string;
        motivation: string;
        status: string;
        relationships: Record<string, string>;
    }[];
}

export interface ChatRequest {
    bookId: string;
    chapterId: string;
    messages: { role: 'user' | 'assistant', content: string }[];
    agentId?: string; // 'archie' or an entityId
}
