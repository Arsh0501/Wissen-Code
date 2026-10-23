"""Private, local PCM transcription worker. Never expose this port publicly."""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "server" / ".env")
os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / ".models"))

TOKEN = os.environ.get("TRANSCRIPTION_TOKEN", "")
if not TOKEN:
    raise RuntimeError("Set TRANSCRIPTION_TOKEN before starting the worker")
MODEL = WhisperModel(
    os.environ.get("WHISPER_MODEL", "base.en"),
    device=os.environ.get("WHISPER_DEVICE", "cpu"),
    compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ready": True})
        self.reply(404, {"error": "Not found"})

    def log_message(self, *_args):
        pass  # Do not log speech or credentials.

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            return self.reply(401, {"error": "Unauthorized"})
        size = int(self.headers.get("Content-Length", "0"))
        if self.path != "/transcribe" or not 3200 <= size <= 128000 or size % 2:
            return self.reply(400, {"error": "Expected 16kHz mono signed little-endian PCM16, 0.1–4 seconds"})
        self.connection.settimeout(15)
        try:
            raw = self.rfile.read(size)
            if len(raw) != size:
                return self.reply(400, {"error": "Incomplete audio"})
            audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
            segments, _info = MODEL.transcribe(
                audio, beam_size=1, vad_filter=True, condition_on_previous_text=False,
                language=os.environ.get("WHISPER_LANGUAGE", "en"),
            )
            text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6)
            self.reply(200, {"text": text[:8000]})
        except Exception:
            self.reply(500, {"error": "Transcription failed"})


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(os.environ.get("TRANSCRIPTION_PORT", "8765"))), Handler).serve_forever()
