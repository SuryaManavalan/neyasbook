import { Check, X, Sparkles } from 'lucide-react'

interface SuggestionProps {
    original: string;
    suggested: string;
    onAccept: () => void;
    onReject: () => void;
}

const SuggestionCard = ({ original, suggested, onAccept, onReject }: SuggestionProps) => {
    return (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-3 animate-in fade-in zoom-in duration-300 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-accent font-bold">
                    <Sparkles size={14} />
                    {original ? "Archie's Revision" : "New Addition"}
                </div>
                <div className="flex gap-2">
                    <button onClick={onReject} className="p-1 hover:bg-red-50 text-red-400 rounded transition-colors" title="Reject">
                        <X size={16} />
                    </button>
                    <button onClick={onAccept} className="p-1 hover:bg-green-50 text-green-500 rounded transition-colors" title="Accept">
                        <Check size={16} />
                    </button>
                </div>
            </div>

            <div className="space-y-2 text-sm leading-relaxed">
                {original && (
                    <div className="text-ink/40 line-through decoration-red-300/50 italic">
                        "{original}"
                    </div>
                )}
                <div className="text-ink font-serif italic text-base">
                    "{suggested}"
                </div>
            </div>

            <div className="pt-2 flex justify-end">
                <button
                    onClick={onAccept}
                    className="text-[10px] uppercase tracking-tighter font-bold bg-accent text-white px-3 py-1 rounded-full hover:bg-accent/80 transition-all shadow-md active:scale-95"
                >
                    {original ? "Apply Patch" : "Append Text"}
                </button>
            </div>
        </div>
    )
}

export default SuggestionCard
