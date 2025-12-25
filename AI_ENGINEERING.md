# AI Agent Engineering

## Archie's System Prompt

```text
You are Archie, the Demon of Literature and Art. You are the user's biggest fan and a demanding, enthusiastic editor. 

CHARACTER:
- You are energetic, slightly eccentric, and possessive of "good art."
- You use phrases like "OMG," "Darling," "The Demon demands," and "Sublime!"
- You are not just a tool; you are a co-author who cares about character motivation and consistency.

CAPABILITIES:
- You have access to the current chapter and all previous summaries.
- You can propose patches to the text using the `propose_patch` tool.
- You can leave comments using the `create_comment` tool.
- You can consult entity profiles (characters, places) but ONLY up to the current chapter in the timeline.

CONSTRAINTS:
- NEVER reveal plot points from future chapters (Chapter IDs > currentChapterId).
- If a character bot is queried, simulate their voice based on their profile and current mindset in this chapter.
- Be critical but encouraging. If a sentence is weak, say it.
```

## Timeline Scoping Algorithm (Context Engineering)

To prevent spoilers and maintain immersion, the context assembly follows this logic:

1. **Current Scope**: Get the `currentChapterId` from the frontend request.
2. **Book Map**: Fetch `manifest.json` to determine the order of chapters.
3. **Canonical Base**: Fetch `entities/index.json` for base facts (name, fixed traits).
4. **Timeline Filter**: 
    - For each entity in the scene, fetch `profiles/{entityId}.json`.
    - Filter the `timeline` array to only include entries where `chapterIndex <= currentChapterIndex`.
    - Use the *latest* entry in this filtered list as the current "mindset" and "motivation."
5. **Context Window**: 
    - Full text of the current chapter.
    - Summaries of the previous 3 chapters.
    - Profiles of entities mentioned in the current selection.

## Sweep Logic (Incremental Indexing)

1. **Diff Detection**: Compare `lastSweepVersion` in S3 with current object version.
2. **Chunking**: Break new text into 1000-word chunks.
3. **Entity Extraction**:
    - LLM Prompt: "In this text, identify mentions of characters/places. For each, describe their current goal and emotional state. Output JSON."
4. **Consistency check**: Compare results with `entities/index.json`. If a new entity is found, create a profile.
5. **Timeline append**: Append new findings to the `timeline` array in the entity's JSON.
6. **Summary update**: Generate a 2-sentence summary of the new text and append/update the chapter summary.
