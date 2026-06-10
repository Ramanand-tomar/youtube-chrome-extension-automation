FROM node:18-slim AS base

RUN apt-get update \
  && apt-get install -y python3 python3-pip ffmpeg curl \
  && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp with EJS (JS challenge solver) support and Instagram support
RUN pip3 install --break-system-packages --upgrade "yt-dlp[ejs]"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p downloads cookies quota schedule

EXPOSE 3000
CMD ["node", "server.js"]
