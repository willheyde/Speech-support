# 🎙️ Speech-support — AI-Powered Speech Improvement App

A real-time speech analysis tool that listens to you talk, identifies issues like mispronunciation, filler words, and pacing, and tracks your improvement over time. Built for non-native speakers, people working on accents, or anyone who wants to become a clearer, more confident communicator.

---

## 💡 What It Does

- **Records** audio directly in the browser
- **Transcribes** speech using OpenAI Whisper (handles accents and non-native English well)
- **Scores** pronunciation accuracy using Azure Cognitive Services
- **Detects** filler words ("um", "uh", "like"), rushed speech, and long pauses
- **Tracks progress** over time with a per-session score history and visual charts
- **Gives actionable feedback** — not just a score, but *why* and *what to fix*

---

## 🏗️ Architecture Overview

```
Browser (React)
  │
  │  WebSocket — audio chunks (PCM/WAV)
  ▼
FastAPI Backend
  ├── Audio buffer → OpenAI Whisper API (transcription + word timestamps)
  ├── Audio buffer → Azure Pronunciation Assessment (phoneme-level scores)
  ├── Transcript → fluency analysis (WPM, filler words, pause detection)
  └── Aggregated feedback JSON → push back over WebSocket to client

FastAPI → PostgreSQL
  └── Users → Sessions → Metrics (WPM, pronunciation score, filler count, etc.)
```

---

## 🧰 Tech Stack

| Layer        | Technology                                           | Why                                                                 |
|-------------|------------------------------------------------------|---------------------------------------------------------------------|
| Frontend    | React + Web Audio API + MediaRecorder                | Native browser APIs handle mic capture; no extra library needed     |
| Realtime    | WebSocket (FastAPI native)                           | Low-latency bidirectional — essential for near-realtime feedback    |
| Backend     | FastAPI (Python)                                     | Async support, WebSocket, huge ML ecosystem                         |
| STT         | OpenAI Whisper API                                   | Best accent/non-native handling; returns word-level timestamps       |
| Pronunciation | Azure Cognitive Services — Pronunciation Assessment | Scores accuracy, fluency, completeness; phoneme-level breakdown     |
| Fluency     | Custom logic on Whisper transcript                   | WPM from timestamps, filler word string match, pause gap detection  |
| Database    | PostgreSQL (SQLite for MVP)                          | Stores users, sessions, and per-session metric scores               |
| Charts      | Recharts                                             | Progress over time visualization                                    |

---

## 📊 What Gets Measured (Per Session)

| Metric               | How It's Calculated                                           |
|----------------------|---------------------------------------------------------------|
| Words Per Minute     | Word count ÷ duration, derived from Whisper timestamps        |
| Pronunciation Score  | Azure returns 0–100 per word and overall                      |
| Filler Word Count    | String match on transcript ("um", "uh", "like", "you know")  |
| Pause Detection      | Gap between word timestamps > threshold (e.g. >1.5 seconds)  |
| Composite Score      | Weighted average: 40% pronunciation, 30% pace, 30% fluency   |

---

## 🗄️ Database Schema (Simplified)

```sql
Users
  id, email, created_at

Sessions
  id, user_id, created_at, duration_seconds, audio_url (optional)

Metrics
  id, session_id,
  wpm FLOAT,
  pronunciation_score FLOAT,
  filler_word_count INT,
  pause_count INT,
  composite_score FLOAT,
  feedback_json JSONB   -- detailed per-word/phoneme breakdown
```

---

## 🚀 MVP Feature Scope

### V1 (Ship This)
- [ ] Record audio in browser and send to backend
- [ ] Whisper transcription with WPM and filler word analysis
- [ ] Azure pronunciation scoring
- [ ] Feedback JSON returned and displayed in UI
- [ ] Save session score to DB
- [ ] Basic progress line chart over sessions

### V2 (After Validation)
- [ ] WebSocket streaming for realtime feedback mid-speech
- [ ] Phoneme-level error tracking (e.g. "you consistently struggle with 'th'")
- [ ] Targeted drill suggestions based on error patterns
- [ ] Streak system and milestones
- [ ] User auth (JWT)

---

## ⚠️ Biggest Risks & Mitigations

| Risk                         | Mitigation                                                          |
|------------------------------|---------------------------------------------------------------------|
| Whisper latency (local)      | Use the Whisper API instead of self-hosting; ~$0.006/min            |
| Model accuracy on accents    | Whisper handles this better than most; Azure helps fill the gap     |
| WebSocket complexity (V1)    | Start with REST POST for V1, upgrade to WebSocket in V2             |
| Azure cost at scale          | Fine for MVP; revisit if traffic grows                              |

---

## 📁 Project Structure

```
speechcoach/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Recorder.jsx         # Mic capture + send audio
│   │   │   ├── FeedbackPanel.jsx    # Display results
│   │   │   └── ProgressChart.jsx    # Recharts session history
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   └── Dashboard.jsx
│   │   └── App.jsx
│   └── package.json
│
├── backend/
│   ├── main.py                      # FastAPI entry point
│   ├── routers/
│   │   ├── sessions.py              # POST /sessions, GET /sessions/{user_id}
│   │   └── analysis.py              # POST /analyze
│   ├── services/
│   │   ├── whisper_service.py       # Calls OpenAI Whisper API
│   │   ├── azure_service.py         # Calls Azure Pronunciation Assessment
│   │   └── fluency_service.py       # WPM, filler, pause calculations
│   ├── models/
│   │   └── db_models.py             # SQLAlchemy models
│   └── requirements.txt
│
└── README.md
```

---

## 🔑 Environment Variables

```env
# Backend (.env)
OPENAI_API_KEY=sk-...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
DATABASE_URL=postgresql://user:password@localhost:5432/speechcoach
```

---

## Getting Started (Local Dev)

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

## Portfolio Notes

This project demonstrates:
- **System design** — multi-model ML pipeline with clear separation of concerns
- **Real-world API integration** — OpenAI + Azure in the same workflow
- **Data modeling** — lightweight schema that scales with the product
- **Product thinking** — the phoneme tracking feature is what makes this a *tool*, not a toy

---

*Built with React, FastAPI, OpenAI Whisper, and Azure Cognitive Services.*
