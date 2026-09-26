FROM node:18-slim AS base

RUN apt-get update \
  && apt-get install -y python3 python3-pip ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp with JS runtime support
RUN pip3 install --break-system-packages --upgrade "yt-dlp[ejs]"

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy all contents inside backend/ directly into /app/
COPY backend/. ./

RUN mkdir -p downloads cookies quota schedule

EXPOSE 3000
CMD ["node", "server.js"]
