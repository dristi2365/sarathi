"""
API routes for Sarathi.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from tracking.tracker import track_objects
from utils.frame_utils import bytes_to_frame
from speech.stt import transcribe_audio
from llm.groq_client import ask_llm
from tts.tts_engine import synthesize_speech

router = APIRouter()


class AskRequest(BaseModel):
    question: str
    detections: list[dict]


class SpeakRequest(BaseModel):
    text: str


@router.post("/detect")
async def detect(image: UploadFile = File(...)):
    try:
        image_bytes = await image.read()
        frame = bytes_to_frame(image_bytes)
        detections = await run_in_threadpool(track_objects, frame)
        return {"count": len(detections), "detections": detections}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {e}")


@router.post("/speech-to-text")
async def speech_to_text(audio: UploadFile = File(...)):
    try:
        audio_bytes = await audio.read()
        text = await run_in_threadpool(
            transcribe_audio, audio_bytes, audio.filename or "audio.wav"
        )
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")


@router.post("/ask")
async def ask(payload: AskRequest):
    try:
        answer = await run_in_threadpool(ask_llm, payload.question, payload.detections)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM request failed: {e}")


@router.post("/speak")
async def speak(payload: SpeakRequest):
    """
    Converts the given Nepali text into speech and returns the URL
    path the frontend can use to play the audio.
    """
    try:
        filename = await run_in_threadpool(synthesize_speech, payload.text)
        return {"audio_url": f"/static/audio/{filename}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {e}")