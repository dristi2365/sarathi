"""
Groq LLM client — sends the question + detections to
llama-3.3-70b-versatile and returns a grounded Nepali answer.
"""

import os
from groq import Groq
from dotenv import load_dotenv

from llm.prompt_builder import SYSTEM_PROMPT, build_user_message

load_dotenv()

_client = None
MODEL_NAME = "llama-3.3-70b-versatile"


def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set. Add it to backend/.env")
        _client = Groq(api_key=api_key)
    return _client


def ask_llm(question: str, detections: list[dict]) -> str:
    """
    Send the question + detected objects to Groq and return the
    Nepali answer text.
    """
    client = get_client()
    user_message = build_user_message(question, detections)

    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature = 0.3,
        max_tokens = 150,
    )

    return response.choices[0].message.content.strip()