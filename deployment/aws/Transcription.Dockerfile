FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/services/transcription
COPY services/transcription/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/transcription/server.py ./server.py
ENV PYTHONUNBUFFERED=1
CMD ["python", "server.py"]
