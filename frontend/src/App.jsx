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
  const detectionsRef = useRef([]); // always holds the LATEST detections
  const isVoiceBusyRef = useRef(false); // true while recording or processing a voice question

  const [backendStatus, setBackendStatus] = useState("जाँच हुँदैछ...");
  const [cameraError, setCameraError] = useState(null);
  const [detections, setDetections] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");

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

  // Keep detectionsRef in sync so the mic handler always has the latest data
  useEffect(() => {
    detectionsRef.current = detections;
  }, [detections]);

  async function captureAndDetect() {
    if (isVoiceBusyRef.current) return; // skip detection while handling voice

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
    isVoiceBusyRef.current = true; // pause background detection while we handle voice
    setTranscript("");
    setAnswer("");
    setVoiceStatus("सुन्दैछु...");

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop()); // release mic
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      await handleVoicePipeline(audioBlob);
    };

    mediaRecorder.start();
    setIsRecording(true);
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

      // 2. Ask the LLM using the LATEST detections
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
        audioRef.current.src = `${BACKEND_URL}${speakData.audio_url}`;
        await audioRef.current.play();
        setVoiceStatus("बोलिरहेको छ...");
        audioRef.current.onended = () => {
          setVoiceStatus("तयार");
          isVoiceBusyRef.current = false; // resume detection after playback ends
        };
        resumedAlready = true; // don't resume early in finally, onended will do it
      }
    } catch (err) {
      console.error("Voice pipeline failed:", err);
      setVoiceStatus("त्रुटि भयो। फेरि प्रयास गर्नुहोस्।");
    } finally {
      if (!resumedAlready) {
        isVoiceBusyRef.current = false; // resume detection immediately
      }
    }
  }

  function handleMicClick() {
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
    </div>
  );
}

export default App;