FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends espeak-ng curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/

ENV MLX_TTS_HOST=0.0.0.0
ENV MLX_TTS_PORT=7860
ENV MLX_TTS_NO_BROWSER=1

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:7860/api/health || exit 1

CMD ["python3", "app/app.py"]
