import { useEffect } from 'react'
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import CharacterCount from '@tiptap/extension-character-count'
import { Bold, Italic, Highlighter, MessageSquarePlus, Feather, Book } from 'lucide-react'

interface EditorProps {
    content: any;
    onChange: (content: any) => void;
    onSelectionChange?: (selectedText: string) => void;
}

const Editor = ({ content, onChange, onSelectionChange }: EditorProps) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Placeholder.configure({
                placeholder: 'The story begins here...',
            }),
            Highlight.configure({ multicolor: true }),
            Typography,
            CharacterCount,
        ],
        content,
        onUpdate: ({ editor }) => {
            onChange(editor.getJSON())
        },
        onSelectionUpdate: ({ editor }) => {
            if (onSelectionChange) {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, ' ');
                onSelectionChange(text);
            }
        },
        editorProps: {
            attributes: {
                class: 'prose prose-stone max-w-none focus:outline-none min-h-[500px] selection:bg-accent/30 pb-[40vh]',
            },
        },
    })

    // Handle external content updates (e.g. from patches)
    useEffect(() => {
        if (editor && content) {
            const isSame = JSON.stringify(editor.getJSON()) === JSON.stringify(content);
            if (!isSame) {
                editor.commands.setContent(content, false);
            }
        }
    }, [content, editor])

    return (
        <div className="relative w-full">
            {editor && (
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="flex bg-white shadow-xl border border-ink/10 rounded-lg overflow-hidden divide-x divide-ink/5">
                    <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-2 hover:bg-ink/5 ${editor.isActive('bold') ? 'text-accent' : ''}`}
                    >
                        <Bold size={16} />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-2 hover:bg-ink/5 ${editor.isActive('italic') ? 'text-accent' : ''}`}
                    >
                        <Italic size={16} />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleHighlight().run()}
                        className={`p-2 hover:bg-ink/5 ${editor.isActive('highlight') ? 'text-accent' : ''}`}
                    >
                        <Highlighter size={16} />
                    </button>
                    <button
                        onClick={() => alert("Comment anchoring would be here.")}
                        className="p-2 hover:bg-ink/5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3"
                    >
                        <MessageSquarePlus size={16} /> Comment
                    </button>
                </BubbleMenu>
            )}
            <EditorContent editor={editor} />
            {editor && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-ink/10 text-[10px] tracking-widest uppercase font-bold text-ink/40 shadow-sm flex items-center gap-6 z-30">
                    <span className="flex items-center gap-1.5"><Feather size={12} /> {editor.storage.characterCount.characters()} Characters</span>
                    <span className="flex items-center gap-1.5"><Book size={12} /> {editor.storage.characterCount.words()} Words</span>
                </div>
            )}
        </div>
    )
}

export default Editor
