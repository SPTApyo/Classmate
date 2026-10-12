# syntax=docker/dockerfile:1
FROM python:3.14-slim AS build

# Only document converters: no audio, cloud or plugins.
# Bundled test suites and bytecode are a third of the size.
RUN PIP_NO_CACHE_DIR=1 pip install --no-compile --prefix=/install "markitdown[pdf,docx,pptx,xlsx,xls]>=0.1,<0.2" \
  && find /install -depth -type d \( -name tests -o -name test -o -name __pycache__ \) -exec rm -rf {} +

FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=build /install /usr/local

RUN useradd --system --uid 10001 --no-create-home converter

WORKDIR /app
COPY server.py .

USER converter
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')"

CMD ["python", "server.py"]
