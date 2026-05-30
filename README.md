# 🤖 Expert Panel Proofreader & Academic Editor

A premium, state-of-the-art web application that leverages a **collaborative panel of multi-agent academic experts** to proofread, polish, critique, and audit scientific papers. 

Featuring a stunning **glassmorphic dark-mode interface**, the application solves the "lazy corrections" problem of typical LLMs through a rigorous, multi-pass auditing pipeline. It offers absolute transparency by visualizing agent reasoning in a WhatsApp-style debate room and verifies facts by parsing source library PDFs.

---

## 🌟 Key Features

1. **The Expert Panel Guild:**
   * **The Orchestrator:** Manages segmentation, stylistic consistency, and merges edits.
   * **The Grammarian:** Audits spelling, punctuation, and gendering rules.
   * **Academic Stylist:** Elevates rhetoric, removes colloquialisms, and sharpens vocabulary.
   * **Reviewer 2 (Critic):** Simulates peer review by scanning for logical gaps and method weaknesses.
   * **Reference Auditor (Quellen-Detektiv):** Cross-checks citations and fact-checks statements against reference files.
   * **Plagiarism Sentinel (Plagiats-Wächter):** Standalone auditor checking text segments directly against source PDFs for matching phrases.

2. **💬 Agent Debate Room (Reasoning Transparency):**
   * View live Slack/WhatsApp-style chat discussions of the agents arguing about specific paragraphs and spelling out why edits were made or references questioned.

3. **🔎 Deep Citation Checker:**
   * Drop a ZIP or individual reference PDFs into your library. The system parses the PDFs and verifies if cited statements actually align with the source material (displaying Green/Yellow/Red trust badges).

4. **🛡️ Standalone Plagiarism Sentinel:**
   * Copy-paste any paragraph or chapter section to run a modular plagiarism check directly against your uploaded PDF references.

---

## 🛠️ Tech Stack

* **Frontend:** Vite + React + Vanilla CSS (Custom HSL slate colors, Backdrop-blur elements, smooth micro-animations).
* **Backend:** Express / Node.js + Multer + PDF-Parse + Google Generative AI (Gemini 1.5 Flash/Pro).
* **Deployment:** Production-ready single-container Dockerization, perfect for Raspberry Pi.

---

## 🚀 Local Developer Setup

### Prerequisites
* Node.js (v18+)
* Gemini API Key

### Installation

1. **Clone & Open:**
   ```bash
   cd /Users/xepter/.gemini/antigravity/scratch/expert-panel-proofreader
   ```

2. **Start Backend Server:**
   ```bash
   cd backend
   npm install
   GEMINI_API_KEY="your_api_key" node server.js
   ```
   *(Or set it directly in the UI dashboard).*

3. **Start Frontend Client:**
   In a new terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 🐳 Raspberry Pi Deployment (Docker & Portainer)

The project is highly optimized for resource-constrained systems like a **Raspberry Pi**. It compiles the React assets during build and hosts them from the Node.js Express backend directly, resulting in a **single, lightweight Node container** using minimal RAM and CPU.

### Method 1: Docker Compose (Recommended)

1. Make sure Docker is installed on your Raspberry Pi.
2. Clone the repository onto your Pi.
3. Build and launch the container:
   ```bash
   docker-compose up -d --build
   ```
4. Access the full application at: `http://<YOUR_RASPBERRY_PI_IP>:5001`

### Method 2: Deployment via Portainer Stack

If you use **Portainer** on your Raspberry Pi:

1. Open your Portainer Dashboard.
2. Navigate to **Stacks** -> **Add Stack**.
3. Name your stack (e.g., `expert-proofreader`).
4. Select **Web editor** and paste the content of `docker-compose.yml`:
   ```yaml
   version: '3.8'

   services:
     expert-proofreader:
       image: expert-panel-proofreader:latest
       container_name: expert_panel_proofreader
       restart: unless-stopped
       ports:
         - "5001:5001"
       environment:
         - PORT=5001
         - GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE # (Optional, can be left empty and pasted in the GUI)
       volumes:
         - ./uploads:/app/backend/uploads
   ```
5. *(Optional)* Add an environment variable `GEMINI_API_KEY` under **Environment variables** if you want to hardcode it.
6. Click **Deploy the stack**. 
7. Sit back and open `http://<YOUR_RASPBERRY_PI_IP>:5001`!

---

## 📄 License
This project is prepared for absolute personal privacy. All uploaded documents and reference libraries reside purely on your local hardware/container mount.
