"""
Text-to-speech using gTTS (Google Text-to-Speech).

Converts Nepali text into an mp3 file saved under backend/static/audio/,
which FastAPI serves as a static file the frontend can play directly.
"""

import os
import uuid
from gtts import gTTS

# Folder where generated audio files are saved. This matches the
# StaticFiles mount we add in main.py.
AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static", "audio")
AUDIO_DIR = os.path.abspath(AUDIO_DIR)
os.makedirs(AUDIO_DIR, exist_ok=True)


def synthesize_speech(text: str) -> str:
    """
    Convert Nepali text into speech and save it as an mp3 file.

    Returns:
        The filename (not full path) of the generated mp3, e.g.
        "a1b2c3d4.mp3" — the frontend will fetch this from
        /static/audio/<filename>.
    """
    if not text or not text.strip():
        raise ValueError("Cannot synthesize empty text.")

    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(AUDIO_DIR, filename)

    tts = gTTS(text=text, lang="ne")  # "ne" = Nepali
    tts.save(filepath)

    return filename