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

## 🛠️ Technology Stack

- **Frontend**: React, Vite, TailwindCSS, Framer Motion, Zustand, Tiptap.
- **Backend**: Node.js, Express, OpenAI API (GPT-4o), AWS SDK.
- **Design System**: Custom "Grimoire" theme using `lucide-react` icons and paper textures.

---

## 🚀 Low-Cost "Serverless" Deployment Strategy

To deploy this application effectively while keeping costs near zero (for personal use), we utilize the **AWS Serverless** architecture. This eliminates the need for expensive, always-on servers (like EC2).

### 1. Frontend: The "Infinite" Library (S3 + CloudFront)
The React application is static. We don't need a server to render it.
- **Build**: Run `npm run build` to generate static HTML/JS/CSS.
- **Store**: Upload the `dist/` folder to an **AWS S3 Bucket** configured for static website hosting.
- **Deliver**: Put **AWS CloudFront** (CDN) in front of the bucket.
    - **Why?** It gives you free SSL (HTTPS), incredibly fast loading speeds globally, and the AWS Free Tier covers significantly more transfer than you'll likely use personally.
- **Cost**: ~$0.01 - $0.50 / month (mostly purely for storage).

### 2. Backend: The "Sleeping" Demon (AWS Lambda)
The Node.js backend currently runs on `localhost`. In production, it should only wake up when you send a message.
- **Compute**: Wrap the Express app using `serverless-http` and deploy it to **AWS Lambda**.
- **Routing**: Use **API Gateway** (HTTP API) to route requests (`/chat`, `/sweep`) to the Lambda function.
- **Why?** Lambda charges *per millisecond* of execution. If you aren't chatting with Archie, you pay $0.00.
- **Cost**: Likely **Free** (AWS Free Tier includes 400,000 GB-seconds of compute per month).

### 3. Storage: replacing the Filesystem (Crucial Step)
Currently, Neyasbook saves chapters and chat history to local JSON files (`/storage`). **Lambda has no persistent hard drive.**
- **The Fix**: Update `server.js` to use **AWS S3** as the storage layer instead of `fs` (FileSystem).
    - `fs.readFileSync()` → `await s3.getObject()`
    - `fs.writeFileSync()` → `await s3.putObject()`
- **Why?** S3 is essentially an infinite, reliable hard drive accessible from Lambda. It's much cheaper and simpler than setting up a database (RDS/SQL) for storing large text blobs like chapters.
- **Alternative**: Use **DynamoDB** also works well for metadata (manifests, entity lists) if you need faster querying, but S3 is sufficient for file-based architecture.

### Summary of Costs
| Service | Role | Est. Monthly Cost (Personal Use) |
| :--- | :--- | :--- |
| **S3** | Storage & Frontend | < $0.10 |
| **Lambda** | Backend Logic | $0.00 (Free Tier) |
| **CloudFront** | Global Deployment | $0.00 (Free Tier) |
| **OpenAI** | Brain Power | Pay-per-token (Usage based) |

**Total Infrastructure Cost:** Cents per month. You essentially only pay OpenAI for the intelligence.
