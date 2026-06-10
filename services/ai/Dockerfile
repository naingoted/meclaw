FROM python:3.14-slim

WORKDIR /app

# Install uv for fast, reproducible installs.
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN uv pip install --system --no-cache .

COPY app ./app

RUN useradd --system --no-create-home --uid 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
