# Optional EV MASTER LAB reference API (FastAPI). Build from the REPOSITORY ROOT so data/drivecycles.json is included:
#   docker build -f backend/python/Dockerfile -t ev-master-lab-api .
#   docker run -p 8000:8000 -e ALLOWED_ORIGINS=https://<user>.github.io ev-master-lab-api
FROM python:3.12-slim
WORKDIR /app
COPY backend/python/requirements.txt backend/python/requirements.txt
RUN pip install --no-cache-dir -r backend/python/requirements.txt
COPY data/drivecycles.json data/drivecycles.json
COPY backend/python backend/python
WORKDIR /app/backend/python
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
