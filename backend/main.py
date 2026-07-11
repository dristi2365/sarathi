"""
Sarathi (सारथी) - AI Voice Assistant for Visually Impaired People
Main FastAPI application entrypoint.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from api.routes import router as api_router

app = FastAPI(
    title="Sarathi API",
    description="AI-powered Nepali Voice Assistant for Visually Impaired People",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Serve generated TTS audio files at /static/audio/<filename>
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(os.path.join(STATIC_DIR, "audio"), exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/status")
def get_status():
    return {
        "status": "ok",
        "service": "Sarathi Backend",
        "message": "सारथी ब्याकइन्ड सफलतापूर्वक चलिरहेको छ।",
    }


@app.get("/")
def root():
    return {"message": "Welcome to Sarathi API. See /docs for available endpoints."}