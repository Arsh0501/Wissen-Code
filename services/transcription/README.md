# Local interview transcription

The interviewer captures the candidate's existing WebRTC audio track. An AudioWorklet converts it to 16 kHz mono PCM16 and sends ordered three-second chunks over the authenticated interview socket. Node forwards audio to this local worker; finalized text is saved in `InterviewTranscriptSegment`. No recordings are saved. Raw transcript text is not automatically fed to AI agents.

## Setup (PowerShell, from repository root)

```powershell
python -m venv services/transcription/.venv
services/transcription/.venv/Scripts/python.exe -m pip install -r services/transcription/requirements.txt
```

Add to `server/.env`:

```dotenv
TRANSCRIPTION_URL=http://127.0.0.1:8765
TRANSCRIPTION_TOKEN=replace-with-a-long-random-secret
WHISPER_MODEL=base.en
WHISPER_LANGUAGE=en
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

Both Node and the Python worker read this file. Keep the worker on loopback; never expose it to browsers/the public internet. Node and the worker must share the secret. The model is downloaded to `.models` on first startup (internet required once); inference then runs locally. You can set `WHISPER_MODEL` to a downloaded model directory. For multilingual interviews use `base` and set the appropriate `WHISPER_LANGUAGE`.

```powershell
# Apply transcript table migration (in server directory):
npx prisma migrate deploy
npx prisma generate
# Run from repository root in a separate terminal:
services/transcription/.venv/Scripts/python.exe services/transcription/server.py
```

Restart the Node backend. Start an interview and connect the existing call. In the interviewer communication panel, confirm participant consent and click **Start transcription**. The candidate sees a capture notification. Saved transcript history reloads when the interviewer reconnects. Only the assigned interviewer can access transcript history. Stop flushes the remaining audio (buffers under 0.1 seconds are discarded); call teardown/disconnection/interview completion cancels pending capture and late results.

## Limits and checks

- This is near-real-time chunked recognition, not word-by-word captions: text appears after a three-second chunk plus inference time. Words spanning chunk boundaries may be imperfect. No interim text or speaker diarization is claimed.
- Candidate audio only; interviewer microphone is not captured. Audio must be connected before starting. HTTPS/localhost and AudioWorklet support are required.
- Up to five queued chunks are allowed. Slow recognition stops with an explicit error rather than growing memory indefinitely. The worker serializes recognition; benchmark concurrency before production.
- Question IDs reflect the server's selected question when a chunk is accepted. A chunk spanning a question change may contain speech from both questions; stop/restart capture when exact boundaries are needed.
- In **Question & code**, open **Use transcript for this question**, select answer segments and correct recognition errors. **Save transcript for this question** saves private reviewed evidence without generating AI output. **Generate follow-ups from selected transcript** saves first and then requests AI suggestions. Reviewed text is stored separately from raw segments and interviewer feedback, in the question notes' `transcriptEvidence` field. Only reviewed text for the selected question is admitted to follow-up context; this works for verbal answers to both coding and non-coding questions. A configured AI provider is required for generation and may incur its own usage costs.
- `GET http://127.0.0.1:8765/health` returns ready only after model loading succeeds.
- Test real microphone audio, technical terms, accents, silence, mute/unmute, hangup, reconnect, worker failure, and interview completion before relying on transcripts.

The recognition engine is [faster-whisper](https://github.com/SYSTRAN/faster-whisper). No paid speech API is used. Existing hardware still supplies the compute.
