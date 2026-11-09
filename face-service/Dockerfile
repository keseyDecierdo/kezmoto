FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt \
 && pip install --no-deps face_recognition==1.3.0 \
 && python -c "import face_recognition, dlib; print('face_recognition ready, dlib', dlib.__version__)"

COPY app.py .

# Render provides $PORT; 8000 is the fallback for running locally.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
