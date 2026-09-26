# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Only document converters: no audio, cloud or plugins.
RUN pip install "markitdown[pdf,docx,pptx,xlsx,xls]>=0.1,<0.2" \
  && useradd --system --uid 10001 --no-create-home converter

WORKDIR /app
COPY server.py .

USER converter
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')"

CMD ["python", "server.py"]
