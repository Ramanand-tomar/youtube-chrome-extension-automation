import axios from 'axios';

export async function extractYoutubeDirectUrl(videoUrl: string): Promise<string> {
  // Use a mobile user-agent to encourage simple formats
  const response = await axios.get(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    }
  });

  const html = response.data;
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
  
  if (!match) {
    throw new Error('Could not find ytInitialPlayerResponse. The video might be restricted or require a complex signature cipher.');
  }

  const data = JSON.parse(match[1]);
  
  if (data.playabilityStatus && data.playabilityStatus.status === 'ERROR') {
    throw new Error(`YouTube Error: ${data.playabilityStatus.reason}`);
  }

  const streamingData = data.streamingData;
  if (!streamingData) {
    throw new Error('No streaming data found in YouTube response.');
  }

  // 1. Try formats (video+audio combined)
  if (streamingData.formats && streamingData.formats.length > 0) {
    const format = streamingData.formats.find((f: any) => f.url) || streamingData.formats[0];
    if (format && format.url) return format.url;
  }

  // 2. Try adaptiveFormats (video only usually, but sometimes has what we need)
  if (streamingData.adaptiveFormats && streamingData.adaptiveFormats.length > 0) {
    const format = streamingData.adaptiveFormats.find((f: any) => f.url && f.mimeType.includes('video/mp4')) || streamingData.adaptiveFormats[0];
    if (format && format.url) return format.url;
  }

  throw new Error('Could not extract a direct URL from the streaming data (it might require deciphering).');
}
