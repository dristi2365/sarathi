"""
Speech-to-text using OpenAI Whisper.
"""

import os
import shutil
import imageio_ffmpeg

# imageio-ffmpeg downloads a binary named like "ffmpeg-win64-v4.2.2.exe",
# but Whisper's internal subprocess call literally runs "ffmpeg" (Windows
# requires the exact filename "ffmpeg.exe" to resolve that). So we copy
# the bundled binary into our own bin/ folder under the correct name,
# then add that folder to PATH for this process.

_bin_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin")
_bin_dir = os.path.abspath(_bin_dir)
os.makedirs(_bin_dir, exist_ok=True)

_target_ffmpeg = os.path.join(_bin_dir, "ffmpeg.exe")

if not os.path.exists(_target_ffmpeg):
    _source_ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    shutil.copyfile(_source_ffmpeg, _target_ffmpeg)
    print(f"[speech] Copied ffmpeg binary to: {_target_ffmpeg}")

os.environ["PATH"] = _bin_dir + os.pathsep + os.environ.get("PATH", "")
print(f"[speech] ffmpeg.exe ready at: {_target_ffmpeg}")

import whisper
import tempfile

MODEL_SIZE = "small"

_model = None


def get_model():
    global _model
    if _model is None:
        print(f"[speech] Loading Whisper '{MODEL_SIZE}' model...")
        _model = whisper.load_model(MODEL_SIZE)
        print("[speech] Whisper model loaded.")
    return _model


def transcribe_audio(audio_bytes: bytes, filename_hint: str = "audio.wav") -> str:
    model = get_model()

    suffix = os.path.splitext(filename_hint)[1] or ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path, language="ne", fp16=False)
        return result["text"].strip()
    finally:
        os.remove(tmp_path)