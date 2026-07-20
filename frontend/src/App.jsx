import { useEffect, useRef, useState } from "react";
import "./App.css";

const BACKEND_URL = "http://localhost:8000";
const DETECT_INTERVAL_MS = 1500;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const detectionsRef = useRef([]);
  const isVoiceBusyRef = useRef(false);

  const [backendStatus, setBackendStatus] = useState("जाँच हुँदैछ...");
  const [cameraError, setCameraError] = useState(null);
  const [detections, setDetections] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");

  // NEW: conversation history — list of { question, answer } pairs
  const [history, setHistory] = useState([]);

  // Backend health check
  useEffect(() => {
    fetch(`${BACKEND_URL}/status`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data.message || "जडान भयो"))
      .catch(() => setBackendStatus("ब्याकइन्डसँग जडान हुन सकेन"));
  }, []);

  // Start camera
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setCameraError("क्यामेरा खोल्न सकिएन। अनुमति दिनुहोस्।");
        console.error(err);
      }
    }
    startCamera();
  }, []);

  useEffect(() => {
    detectionsRef.current = detections;
  }, [detections]);

  async function captureAndDetect() {
    if (isVoiceBusyRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append("image", blob, "frame.jpg");
        try {
          setIsDetecting(true);
          const res = await fetch(`${BACKEND_URL}/detect`, { method: "POST", body: formData });
          const data = await res.json();
          setDetections(data.detections || []);
        } catch (err) {
          console.error("Detection request failed:", err);
        } finally {
          setIsDetecting(false);
        }
      },
      "image/jpeg",
      0.8
    );
  }

  useEffect(() => {
    const interval = setInterval(captureAndDetect, DETECT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------- VOICE LOOP ----------

  async function startRecording() {
  setTranscript("");
  setAnswer("");
  setVoiceStatus("सुन्दैछु...");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      console.log("RECORDED BLOB SIZE:", audioBlob.size, "bytes");
      isVoiceBusyRef.current = true; // set busy only once recording actually finished
      await handleVoicePipeline(audioBlob);
    };

    mediaRecorder.onerror = (e) => {
      console.error("MediaRecorder error:", e);
      setVoiceStatus("त्रुटि भयो (माइक्रोफोन)। फेरि प्रयास गर्नुहोस्।");
      isVoiceBusyRef.current = false;
      setIsRecording(false);
    };

    mediaRecorder.start(250);
    setIsRecording(true);
  } catch (err) {
    console.error("Could not start recording:", err);
    setVoiceStatus("माइक्रोफोन खोल्न सकिएन। अनुमति जाँच्नुहोस्।");
    isVoiceBusyRef.current = false;
    setIsRecording(false);
  }
}

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function handleVoicePipeline(audioBlob) {
    let resumedAlready = false;

    try {
      // 1. Speech-to-text
      setVoiceStatus("बुझ्दैछु...");
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const sttRes = await fetch(`${BACKEND_URL}/speech-to-text`, {
        method: "POST",
        body: formData,
      });

      if (!sttRes.ok) {
        const errText = await sttRes.text();
        console.error("STT failed:", sttRes.status, errText);
        setVoiceStatus("त्रुटि भयो (STT)। फेरि प्रयास गर्नुहोस्।");
        return;
      }

      const sttData = await sttRes.json();
      const question = sttData.text ? sttData.text.trim() : "";
      setTranscript(question);

      if (!question) {
        setVoiceStatus("केही सुनिएन। फेरि प्रयास गर्नुहोस्।");
        return;
      }

      // 2. Ask the LLM
      setVoiceStatus("सोच्दैछु...");
      const askRes = await fetch(`${BACKEND_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          detections: detectionsRef.current,
        }),
      });

      if (!askRes.ok) {
        const errText = await askRes.text();
        console.error("Ask failed:", askRes.status, errText);
        setVoiceStatus("त्रुटि भयो (Ask)। फेरि प्रयास गर्नुहोस्।");
        return;
      }

      const askData = await askRes.json();
      const answerText = askData.answer ? askData.answer.trim() : "";
      setAnswer(answerText);

      if (!answerText) {
        setVoiceStatus("माफ गर्नुहोस्, जवाफ दिन सकिएन।");
        return;
      }

      // NEW: add this Q&A pair to conversation history
      setHistory((prev) => [
        ...prev,
        { question: question, answer: answerText, time: new Date().toLocaleTimeString() },
      ]);

      // 3. Text-to-speech
      setVoiceStatus("बोल्दैछु...");
      const speakRes = await fetch(`${BACKEND_URL}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answerText }),
      });

      if (!speakRes.ok) {
        const errText = await speakRes.text();
        console.error("Speak failed:", speakRes.status, errText);
        setVoiceStatus("त्रुटि भयो (Speak)। फेरि प्रयास गर्नुहोस्।");
        return;
      }

      const speakData = await speakRes.json();

      if (speakData.audio_url && audioRef.current) {
        try {
          audioRef.current.src = `${BACKEND_URL}${speakData.audio_url}`;
          await audioRef.current.play();
          setVoiceStatus("बोलिरहेको छ...");
          audioRef.current.onended = () => {
            setVoiceStatus("तयार");
            isVoiceBusyRef.current = false;
          };
          resumedAlready = true;
        } catch (playErr) {
          console.error("Audio playback failed:", playErr);
          setVoiceStatus("जवाफ बज्न सकेन।");
          // resumedAlready stays false, so finally below resets the busy flag
        }
      }
    } catch (err) {
      console.error("Voice pipeline failed:", err);
      setVoiceStatus("त्रुटि भयो। फेरि प्रयास गर्नुहोस्।");
    } finally {
      if (!resumedAlready) {
        isVoiceBusyRef.current = false;
      }
      setIsRecording(false); // resyncs mic button state no matter what happened
    }
  }

  function handleMicClick() {
    console.log("MIC BUTTON CLICKED, isRecording:", isRecording);
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  const directionLabel = { left: "देब्रे", front: "अगाडि", right: "दायाँ" };
  const distanceLabel = { near: "नजिक", medium: "मध्यम", far: "टाढा" };

  return (
    <div className="app">
      <header className="app-header">
        <h1>सारथी</h1>
        <p className="subtitle">दृष्टिविहीनहरूको लागि AI सहायक</p>
      </header>

      <div className="status-bar">
        <span className={`status-dot ${cameraError ? "error" : "ok"}`}></span>
        <span>{cameraError || backendStatus}</span>
        {isDetecting && <span className="detecting-tag">पत्ता लगाउँदै...</span>}
      </div>

      <div className="camera-container">
        <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <button
        className={`mic-button ${isRecording ? "recording" : ""}`}
        onClick={handleMicClick}
      >
        {isRecording ? "🎤 रोक्नुहोस्" : "🎤 बोल्नुहोस्"}
      </button>

      {voiceStatus && <p className="voice-status">{voiceStatus}</p>}

      {transcript && (
        <div className="voice-box">
          <span className="voice-label">तपाईंले भन्नुभयो:</span>
          <p>{transcript}</p>
        </div>
      )}

      {answer && (
        <div className="voice-box answer-box">
          <span className="voice-label">सारथीको जवाफ:</span>
          <p>{answer}</p>
        </div>
      )}

      <audio ref={audioRef} style={{ display: "none" }} />

      <div className="detections-panel">
        <h2>पत्ता लागेका वस्तुहरू</h2>
        {detections.length === 0 ? (
          <p className="empty-text">हाल कुनै वस्तु पत्ता लागेको छैन।</p>
        ) : (
          <ul className="detections-list">
            {detections.map((obj) => (
              <li key={obj.track_id} className="detection-item">
                <span className="obj-name">{obj.name}</span>
                <span className="obj-meta">
                  {directionLabel[obj.direction] || obj.direction} ·{" "}
                  {distanceLabel[obj.distance] || obj.distance}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* NEW: Conversation history panel */}
      {history.length > 0 && (
        <div className="history-panel">
          <h2>कुराकानी इतिहास</h2>
          <ul className="history-list">
            {history
              .slice()
              .reverse()
              .map((item, index) => (
                <li key={index} className="history-item">
                  <div className="history-question">
                    <span className="history-label">प्रश्न:</span> {item.question}
                  </div>
                  <div className="history-answer">
                    <span className="history-label">जवाफ:</span> {item.answer}
                  </div>
                  <div className="history-time">{item.time}</div>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;