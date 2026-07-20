# सारथी (Sarathi)

**AI-powered Nepali voice assistant for visually impaired users.**

Built at [ORCHID HACKX] by **Team Star**:
- Dristi Shakya
- Sweta Aryal
- Purnima Pant

Sarathi uses a live camera feed to detect and track nearby objects, and lets users ask spoken questions in Nepali about their surroundings. It responds with a short, grounded spoken answer — helping visually impaired users understand what's around them.

---

## ✨ Features

- **Real-time object detection & tracking** — YOLOv8 + ByteTrack identify objects in the camera feed and assign each a stable ID across frames.
- **Direction & distance estimation** — every detected object is tagged as left / front / right and near / medium / far, relative to the camera frame.
- **Voice Q&A in Nepali** — press the mic button, ask a question out loud, and get a spoken Nepali answer grounded only in what's currently detected.
- **Speech-to-text** — powered by OpenAI Whisper.
- **LLM reasoning** — powered by Groq (`llama-3.3-70b-versatile`), using a strict system prompt that only references detected objects (no hallucinated objects/directions/distances).
- **Text-to-speech** — powered by gTTS, generating Nepali audio responses.
- **Conversation history** — a running log of previous questions and answers.

---

## 🏗️ Project Structure

sarathi/
├── backend/
│ ├── api/
│ │ └── routes.py # FastAPI route handlers
│ ├── llm/
│ │ ├── groq_client.py # Groq API client
│ │ └── prompt_builder.py # System prompt + message formatting
│ ├── speech/
│ │ └── stt.py # Whisper speech-to-text
│ ├── tracking/
│ │ └── tracker.py # YOLOv8 + ByteTrack object tracking
│ ├── tts/
│ │ └── tts_engine.py # gTTS text-to-speech
│ ├── utils/
│ │ └── frame_utils.py # Image byte <-> OpenCV frame conversion
│ ├── vision/
│ │ └── detector.py # (legacy) plain YOLOv8 detection, unused
│ ├── static/audio/ # Generated TTS audio files (served statically)
│ ├── bin/ # Local ffmpeg binary (auto-copied at runtime)
│ ├── main.py # FastAPI app entrypoint
│ ├── requirements.txt
│ ├── yolov8n.pt # YOLOv8 nano model weights
│ └── .env # GROQ_API_KEY goes here
└── frontend/
├── src/
│ ├── App.jsx # Main React app (camera, mic, detections, Q&A)
│ ├── App.css
│ ├── main.jsx
│ └── index.css
├── index.html
└── package.json


---

## ⚙️ Requirements

- Python 3.11+
- Node.js + npm
- A [Groq API key](https://console.groq.com/) (free tier available)
- Windows/macOS/Linux with a working webcam + microphone

---

## 🚀 Setup & Running

### 1. Backend

```bash
cd sarathi/backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

Create a `.env` file inside `backend/` with:

GROQ_API_KEY=your_groq_api_key_here


Run the server (must be run from inside `backend/`, since model paths are relative):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Verify it's running by visiting **http://localhost:8000/docs** in a browser.

### 2. Frontend

In a **separate terminal**:

```bash
cd sarathi/frontend
npm install
npm run dev
```

Open the printed local URL (usually **http://localhost:5173**), and allow camera and microphone permissions when prompted.

---

## 🔌 API Endpoints

| Endpoint             | Method | Description                                              |
|-----------------------|--------|------------------------------------------------------------|
| `/detect`             | POST   | Accepts an image, returns tracked object detections        |
| `/speech-to-text`     | POST   | Accepts audio, returns transcribed Nepali text              |
| `/ask`                | POST   | Accepts a question + detections, returns a Nepali answer    |
| `/speak`              | POST   | Accepts text, returns a URL to a generated Nepali audio file |

---

## 🧠 How it works

1. The frontend captures a camera frame every ~1.5 seconds and sends it to `/detect`.
2. YOLOv8 + ByteTrack detect and track objects, tagging each with a direction and distance estimate.
3. When the user presses the mic button and asks a question:
   - Audio is sent to `/speech-to-text` (Whisper) to get the transcribed question.
   - The question + current detections are sent to `/ask`, which prompts Groq's LLM to answer using **only** the detected objects — never inventing new ones.
   - The answer text is sent to `/speak`, generating a Nepali audio file the frontend plays back.

---

## ⚠️ Known Limitations

- YOLOv8 + Whisper run on CPU by default; response times depend on hardware.
- Distance/direction estimates are heuristic (based on bounding box size/position), not true depth sensing.
- `vision/detector.py` is a legacy, unused duplicate of the tracking logic — kept for reference only.

---

## 🧗 Challenges We Faced

- **Blocking the server event loop** — our FastAPI routes were declared `async def` but called synchronous, CPU-heavy functions (YOLO inference, Whisper transcription) directly. This froze the entire server under load, causing requests to queue up indefinitely instead of completing. Fixed by offloading blocking calls to a thread pool with `run_in_threadpool`.
- **Windows dependency build failures** — packages like `lap` and `cython-bbox` failed to build from source on Windows due to `pkg_resources`/`Cython` issues in isolated build environments. Resolved by switching to prebuilt-wheel alternatives (e.g. `lapx`) and relying on Ultralytics' built-in ByteTrack integration instead.
- **ffmpeg binary naming on Windows** — Whisper's internal subprocess calls expected an executable literally named `ffmpeg.exe`, which required copying and renaming the `imageio-ffmpeg`-bundled binary at runtime.
- **Slow / unreliable speech-to-text** — Whisper's `medium` model was too slow for real-time use on CPU, and short/rushed microphone recordings sometimes produced malformed audio files that ffmpeg couldn't parse.
- **Keeping LLM answers grounded** — preventing the model from inventing objects, directions, or distances not actually detected required a strict, rule-heavy system prompt rather than a general-purpose one.
- **Balancing accuracy vs. speed** — heuristic distance/direction estimation (based on bounding box size and position) had to substitute for true depth sensing, given hackathon time constraints.

---

## 🚀 Future Improvements

- Switch to a smaller/faster Whisper model (or a streaming STT service) for quicker, more reliable voice responses.
- Add continuous, automatic scene narration (not just on-demand Q&A), with proper throttling so it doesn't talk over user questions or overwhelm the user.
- Draw live bounding boxes directly on the camera feed for sighted companions/testing purposes.
- Use a proper depth sensor or stereo camera for accurate distance estimation instead of bounding-box-size heuristics.
- Add offline/low-connectivity support, since the current pipeline depends on external APIs (Groq, gTTS).
- Package the ffmpeg/model setup more robustly across operating systems, instead of runtime binary copying.
- Add multi-language support beyond Nepali.

---

## 🛠️ Tech Stack

**Backend**
- Python, FastAPI, Uvicorn
- YOLOv8 (Ultralytics) + ByteTrack — object detection & tracking
- OpenAI Whisper — speech-to-text
- Groq API (`llama-3.3-70b-versatile`) — LLM reasoning
- gTTS — text-to-speech
- OpenCV — image/frame processing

**Frontend**
- React + Vite
- Browser MediaDevices API (camera + microphone access)
- Canvas API (frame capture)

---

## 🙏 Acknowledgements

This project was built in a short, intense span of time by Team STAR — Dristi Shakya, Sweta Aryal, and Purnima Pant. We learned a lot along the way, from debugging real-time systems to grounding an LLM's responses in truth. Our hope is that ideas like Sarathi can, in some small way, make the world a little more accessible.

Thank you to everyone who supported and mentored us throughout this hackathon.

**सारथी — तपाईंको साथी, हरेक कदममा।**
*(Sarathi — your companion, every step of the way.)*