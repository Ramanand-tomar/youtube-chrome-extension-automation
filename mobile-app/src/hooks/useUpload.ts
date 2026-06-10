import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { uploadYouTube, uploadInstagram, scheduleUpload, YouTubeUploadPayload, InstagramUploadPayload, SchedulePayload } from '../services/api';

export type UploadStatus = 'idle' | 'uploading' | 'complete' | 'error' | 'scheduled';

export interface UploadLog {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

// Map stage keywords → progress %
const STAGE_PROGRESS: Record<string, number> = {
  downloading: 10,
  cloudinary: 40,
  youtube: 70,
  cleanup: 90,
  complete: 100,
};

function parseNdjsonLine(line: string): any | null {
  try {
    return JSON.parse(line.trim());
  } catch {
    return null;
  }
}

export function useUpload() {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((message: string, type: UploadLog['type'] = 'info') => {
    setLogs((prev) => [...prev, { id: logIdRef.current++, message, type }]);
  }, []);

  const resetUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setProgress(0);
    setLogs([]);
    setStatus('idle');
    setVideoUrl(null);
    setErrorMessage(null);
    logIdRef.current = 0;
  }, []);

  const handleXhr = useCallback((xhr: XMLHttpRequest) => {
    xhrRef.current = xhr;
    let processedLength = 0;
    let currentStatus: UploadStatus = 'uploading';

    const processChunk = (chunk: string) => {
      const lines = chunk.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const event = parseNdjsonLine(line);
        if (!event) {
          addLog(line, 'info');
          continue;
        }

        const msg: string = event.message || event.status || JSON.stringify(event);
        const stage: string = (event.stage || event.status || '').toLowerCase();

        const logType: UploadLog['type'] =
          stage === 'error' || event.error ? 'error' :
          stage === 'complete' ? 'success' : 'info';

        addLog(msg, logType);

        if (stage === 'error' || event.error) {
          currentStatus = 'error';
          setStatus('error');
          setErrorMessage(typeof event.error === 'string' ? event.error : msg);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }

        if (stage === 'complete' || event.videoId || event.videoUrl) {
          currentStatus = 'complete';
          setStatus('complete');
          setProgress(100);
          setVideoUrl(event.videoUrl || event.shortUrl || null);
          setErrorMessage(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        for (const [key, pct] of Object.entries(STAGE_PROGRESS)) {
          if (stage.includes(key) || msg.toLowerCase().includes(key)) {
            setProgress(pct);
            break;
          }
        }

        if (stage === 'batch-processing' && event.current && event.total) {
          const batchPct = Math.round((event.current / event.total) * 60) + 10; // 10–70%
          setProgress(batchPct);
        }
      }
    };

    setStatus('uploading');
    setProgress(5);
    setErrorMessage(null);

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      processChunk(chunk);
    };

    xhr.onerror = () => {
      addLog('Network error — could not reach server', 'error');
      setStatus('error');
      setErrorMessage('Unable to reach backend. Check your network or try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };

    xhr.onabort = () => {
      addLog('Upload canceled.', 'info');
      if (currentStatus === 'uploading') {
        setStatus('idle');
        setProgress(0);
        setErrorMessage(null);
      }
    };

    xhr.onload = () => {
      const chunk = xhr.responseText.slice(processedLength);
      processChunk(chunk);
      processedLength = xhr.responseText.length;

      if (xhr.status >= 400) {
        addLog(`Server error: ${xhr.status} ${xhr.statusText || ''}`.trim(), 'error');
        setStatus('error');
        setErrorMessage(`Server returned ${xhr.status}.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (currentStatus === 'uploading') {
        addLog('Upload ended without a completion event. Please try again or refresh the page.', 'error');
        setStatus('error');
        setErrorMessage('Upload ended without completion confirmation.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };
  }, [addLog]);

  const startYouTubeUpload = useCallback((payload: YouTubeUploadPayload) => {
    resetUpload();
    addLog('Starting upload…', 'info');
    const xhr = uploadYouTube(payload);
    handleXhr(xhr);
  }, [resetUpload, addLog, handleXhr]);

  const startInstagramUpload = useCallback((payload: InstagramUploadPayload) => {
    resetUpload();
    addLog('Starting batch upload…', 'info');
    const xhr = uploadInstagram(payload);
    handleXhr(xhr);
  }, [resetUpload, addLog, handleXhr]);

  const startSchedule = useCallback(async (payload: SchedulePayload) => {
    try {
      setStatus('uploading');
      addLog('Scheduling upload…', 'info');
      await scheduleUpload(payload);
      addLog('Upload scheduled successfully!', 'success');
      setStatus('scheduled');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      addLog(`Failed to schedule: ${err.message}`, 'error');
      setStatus('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [addLog]);

  return {
    progress,
    logs,
    status,
    videoUrl,
    errorMessage,
    isUploading: status === 'uploading',
    startYouTubeUpload,
    startInstagramUpload,
    startSchedule,
    resetUpload,
  };
}
