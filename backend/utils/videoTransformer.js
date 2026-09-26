const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const FFMPEG_COMMAND = process.env.FFMPEG_COMMAND || 'ffmpeg';

/**
 * Default preset configurations for Reel Transformation
 */
const PRESETS = {
  quick_anti_detect: {
    flipHorizontal: true,
    speedRatio: 1.04,
    cropPercent: 3,
    colorFilter: 'cinematic',
    pitchShift: 1.02
  },
  viral_hook: {
    flipHorizontal: true,
    speedRatio: 1.03,
    cropPercent: 2,
    colorFilter: 'contrast',
    topBannerText: 'WAIT FOR THE END 😱',
    topBannerBgColor: 'black',
    topBannerTextColor: 'yellow'
  },
  branded: {
    flipHorizontal: false,
    speedRatio: 1.02,
    cropPercent: 2,
    colorFilter: 'warm',
    watermarkText: '@reeltrending'
  }
};

/**
 * Escapes text for FFmpeg drawtext filter
 */
function escapeDrawText(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

/**
 * Transforms an input video file using FFmpeg filtergraphs based on custom options or presets.
 * 
 * @param {string} inputPath - Absolute path to the source video file
 * @param {string} outputPath - Absolute path to save the transformed video file
 * @param {Object} options - Customization options
 * @returns {Promise<string>} - Resolves with outputPath
 */
function transformVideo(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input video file not found at: ${inputPath}`));
    }

    // Merge preset if provided
    let config = { ...options };
    if (options.preset && PRESETS[options.preset]) {
      config = { ...PRESETS[options.preset], ...options };
    }

    const {
      flipHorizontal = false,
      speedRatio = 1.0,
      cropPercent = 0,
      colorFilter = 'none',
      topBannerText = '',
      topBannerBgColor = 'black@0.8',
      topBannerTextColor = 'white',
      watermarkText = '',
      pitchShift = 1.0
    } = config;

    const videoFilters = [];
    const audioFilters = [];

    // 1. Horizontal Flip (Mirroring)
    if (flipHorizontal) {
      videoFilters.push('hflip');
    }

    // 2. Micro Zoom & Crop (1% to 10%)
    if (cropPercent > 0) {
      const scaleFactor = 1 - (cropPercent / 100);
      videoFilters.push(`crop=iw*${scaleFactor}:ih*${scaleFactor}`);
    }

    // 3. Force 9:16 aspect ratio output scaling (1080x1920)
    videoFilters.push('scale=1080:1920:force_original_aspect_ratio=decrease');
    videoFilters.push('pad=1080:1920:(1080-iw)/2:(1920-ih)/2:black');

    // 4. Color Grading Filter
    if (colorFilter === 'warm') {
      videoFilters.push('colorbalance=rs=0.15:gs=0.05:bs=-0.10,eq=saturation=1.15');
    } else if (colorFilter === 'cool') {
      videoFilters.push('colorbalance=rs=-0.10:bs=0.15,eq=saturation=1.05');
    } else if (colorFilter === 'cinematic') {
      videoFilters.push('eq=contrast=1.15:brightness=-0.02:saturation=1.20');
    } else if (colorFilter === 'contrast') {
      videoFilters.push('eq=contrast=1.25:saturation=1.10');
    }

    // 5. Playback Speed Shift (setpts)
    if (speedRatio !== 1.0 && speedRatio > 0.5 && speedRatio < 2.0) {
      const ptsFactor = (1.0 / speedRatio).toFixed(5);
      videoFilters.push(`setpts=${ptsFactor}*PTS`);
      audioFilters.push(`atempo=${speedRatio}`);
    }

    // 6. Top Banner Hook Text Overlay
    if (topBannerText && topBannerText.trim()) {
      const escapedText = escapeDrawText(topBannerText.trim());
      videoFilters.push(
        `drawtext=text='${escapedText}':fontcolor=${topBannerTextColor}:fontsize=44:box=1:boxcolor=${topBannerBgColor}:boxborderw=24:x=(w-text_w)/2:y=120`
      );
    }

    // 7. Watermark Handle Overlay
    if (watermarkText && watermarkText.trim()) {
      const escapedWM = escapeDrawText(watermarkText.trim());
      videoFilters.push(
        `drawtext=text='${escapedWM}':fontcolor=white@0.7:fontsize=28:x=w-tw-40:y=h-th-80`
      );
    }

    // 8. Audio Pitch Shift (via asetrate & atempo compensation if specified)
    if (pitchShift !== 1.0 && pitchShift > 0.8 && pitchShift < 1.3) {
      const sampleRate = Math.round(44100 * pitchShift);
      const tempoComp = (1 / pitchShift).toFixed(5);
      audioFilters.push(`asetrate=${sampleRate},aresample=44100,atempo=${tempoComp}`);
    }

    // Construct FFmpeg command arguments
    const args = ['-y', '-i', inputPath];

    if (videoFilters.length > 0) {
      args.push('-vf', videoFilters.join(','));
    }

    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    // Video encoding settings: H.264, AAC audio, 30fps
    args.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      outputPath
    );

    console.log(`[VideoTransformer] Executing command: ${FFMPEG_COMMAND} ${args.join(' ')}`);

    const ffmpegProc = spawn(FFMPEG_COMMAND, args);

    let stderr = '';

    ffmpegProc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpegProc.on('error', (err) => {
      reject(new Error(`Failed to launch FFmpeg: ${err.message}`));
    });

    ffmpegProc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[VideoTransformer] FFmpeg error output: ${stderr}`);
        return reject(new Error(`FFmpeg video transformation failed with exit code ${code}`));
      }

      if (!fs.existsSync(outputPath)) {
        return reject(new Error('FFmpeg completed but output video file was not generated.'));
      }

      console.log(`[VideoTransformer] Transformation successful -> ${outputPath}`);
      resolve(outputPath);
    });
  });
}

module.exports = {
  transformVideo,
  PRESETS
};
