FROM python:3.11-slim

WORKDIR /app

COPY oracle/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY oracle/ .

CMD ["python3", "oracle.py"]
