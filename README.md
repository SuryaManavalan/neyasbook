# 📖 Neyasbook: The AI-Native Grimoire

**Neyasbook** is an intelligent, immersive writing environment designed to be a co-author rather than just a tool. It blends a sophisticated "Paper & Ink" aesthetic with deep AI integration that understands not just text, but the *world* you are building.

## ✨ Key Features

### 🧠 Archie: The Demon of Literature
Your creative partner, bound to the manuscript. Archie isn't a generic chatbot; he is a literary critic and editor who:
- **Proactively Nudges**: If you stop writing, Archie reads your last paragraph and offers thematic suggestions.
- **Understands Prose**: He analyzes tone, pacing, and subtext, not just grammar.
- **Silent Context**: He knows exactly which chapter you are in and what has happened so far, without you needing to explain it.

### 🌍 World Weaver & Entity Intelligence
Neyasbook maintains a living database of your story's lore.
- **The Sweep**: A background agent that reads your chapters and automatically extracts Characters, Places, and Institutions.
- **Mention System**: Type `@` to summon any entity. The system instantly injects their "Canonical Facts" and "Timeline History" into the AI's mind, ensuring perfect recall of your lore.
- **Shadow Context**: Roleplay with your characters! They know their own history up to the *current chapter*, preventing spoilers from the future.

### 🖋️ "Paper & Ink" UI
A distraction-free interface designed to feel like a magical artifact.
- **Texture & typography** focused on long-form readability.
- **Tiptap Editor** with structure-aware formatting (drag-and-drop chapters, smart quotes).

---

## � Deployment

For ultra-cheap serverless deployment on AWS (~$0.10/month):

```bash
./deploy.sh
```

See [DEPLOY.md](DEPLOY.md) for detailed deployment guide and troubleshooting.

**Live App**: http://neyasbookstack-websitebucket75c24d94-a5s9pyo6n2uc.s3-website-us-east-1.amazonaws.com

---

## 🛠️ Technology Stack

- **Frontend**: React, Vite, TailwindCSS, Framer Motion, Zustand, Tiptap.
- **Backend**: Node.js, Express, OpenAI API (GPT-4o), AWS SDK.
- **Infrastructure**: AWS Lambda, API Gateway, S3 (serverless, ~$0.10/month).
- **Design System**: Custom "Grimoire" theme using `lucide-react` icons and paper textures.
