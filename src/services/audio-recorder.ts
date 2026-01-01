'use client'

import type { VideoPlayerControls } from '@/types/video'

/**
 * Service for recording system audio from video markers
 */
/**
 * Convert AudioBuffer to WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numOfChan = buffer.numberOfChannels
  const bitsPerSample = 16  // Standard CD quality
  const bytesPerSample = bitsPerSample / 8
  const length = buffer.length * numOfChan * bytesPerSample
  const sampleRate = buffer.sampleRate
  const result = new ArrayBuffer(44 + length)
  const view = new DataView(result)

  // RIFF chunk descriptor
  writeUTFBytes(view, 0, 'RIFF')
  view.setUint32(4, 36 + length, true)
  writeUTFBytes(view, 8, 'WAVE')

  // FMT sub-chunk
  writeUTFBytes(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // subchunk1size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numOfChan, true) // Number of channels
  view.setUint32(24, sampleRate, true) // Sample rate
  view.setUint32(28, sampleRate * bytesPerSample * numOfChan, true) // Byte rate
  view.setUint16(32, numOfChan * bytesPerSample, true) // Block align
  view.setUint16(34, bitsPerSample, true) // Bits per sample

  // Data sub-chunk
  writeUTFBytes(view, 36, 'data')
  view.setUint32(40, length, true)

  // Write the PCM samples
  const channelData = []
  let offset = 44
  for (let i = 0; i < numOfChan; i++) {
    channelData.push(buffer.getChannelData(i))
  }

  // Write the PCM samples with 16-bit depth
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]))
      // Convert to 16-bit audio
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, value, true)
      offset += 2
    }
  }

  return result
}

/**
 * Write UTF bytes to DataView
 */
function writeUTFBytes(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

const RECORDINGS_DIRECTORY = 'Recordings'

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[^a-zA-Z0-9-_. ]/g, '_')
    .replace(/^[./]+/, '')
    .trim()
  return cleaned || 'recording.wav'
}

async function getUniqueFilename(
  directoryHandle: FileSystemDirectoryHandle,
  filename: string
): Promise<string> {
  const lastDotIndex = filename.lastIndexOf('.')
  const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename
  const extension = lastDotIndex > 0 ? filename.slice(lastDotIndex) : ''

  let candidate = filename
  let counter = 1

  while (true) {
    try {
      await directoryHandle.getFileHandle(candidate)
      candidate = `${baseName} (${counter})${extension}`
      counter += 1
    } catch (error) {
      if ((error as { name?: string })?.name === 'NotFoundError') {
        return candidate
      }
      throw error
    }
  }
}

async function prepareAudioForExport(
  blob: Blob,
  filename: string
): Promise<{ blob: Blob; filename: string }> {
  if (blob.size === 0) {
    console.error('Cannot export empty audio blob')
    throw new Error('No audio data available for export')
  }

  const audioContext = new AudioContext({
    sampleRate: 44100,  // CD quality
    latencyHint: 'playback'
  })

  try {
    const arrayBuffer = await blob.arrayBuffer()

    if (arrayBuffer.byteLength === 0) {
      console.error('Empty array buffer from blob')
      throw new Error('No audio data available for export')
    }

    try {
      const audioData = await audioContext.decodeAudioData(arrayBuffer)

      const offlineContext = new OfflineAudioContext({
        numberOfChannels: 2,
        length: audioData.length,
        sampleRate: 44100    // CD quality
      })

      const source = offlineContext.createBufferSource()
      source.buffer = audioData

      const compressor = offlineContext.createDynamicsCompressor()
      compressor.threshold.value = -24
      compressor.knee.value = 10
      compressor.ratio.value = 4
      compressor.attack.value = 0.005
      compressor.release.value = 0.250

      const gain = offlineContext.createGain()
      gain.gain.value = 1.2

      const analyzer = offlineContext.createAnalyser()
      analyzer.fftSize = 2048
      
      source
        .connect(compressor)
        .connect(gain)
        .connect(analyzer)
        .connect(offlineContext.destination)

      source.start(0)

      const renderedBuffer = await offlineContext.startRendering()
      const wavArrayBuffer = audioBufferToWav(renderedBuffer)
      
      const outputBlob = new Blob([wavArrayBuffer], { type: 'audio/wav' })
      const outputFilename = filename.replace(/\.(webm|mp3)$/, '.wav')

      return { blob: outputBlob, filename: outputFilename }
    } catch (decodeError) {
      console.error('Failed to decode audio data:', decodeError)
      return { blob, filename }
    }
  } finally {
    void audioContext.close().catch(() => {})
  }
}

export interface TimeMarkerAudio {
  audioBlob: Blob | null
  isRecording: boolean
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stopTimeout: NodeJS.Timeout | null = null

  /**
   * Start recording system audio with video playback coordination
   */
  async startRecording(startTime: number, endTime: number, videoControls: VideoPlayerControls): Promise<Blob | null> {
    // Variable to track resources that need cleanup
    let displayStream: MediaStream | null = null;
    
    try {
      if (this.mediaRecorder) {
        // Clean up existing recording if any
        await this.stopRecording()
      }

      console.log('Starting recording from', startTime, 'to', endTime)
      
      // Get system audio and screen share
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1280,
          height: 720
        },
        audio: {
          channelCount: 2,
          sampleRate: 44100,    // CD quality
          sampleSize: 16,       // 16-bit audio
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false
        }
      })

      const audioTracks = displayStream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('No audio track available in the captured stream')
      }

      // Create audio context for processing
      const audioContext = new AudioContext({
        sampleRate: 44100,  // Standard CD quality
        latencyHint: 'interactive'
      })

      // Create source from the audio track
      const streamSource = audioContext.createMediaStreamSource(displayStream)

      // Create dynamics compressor
      const compressor = audioContext.createDynamicsCompressor()
      compressor.threshold.value = -24  // Start compressing at -24dB
      compressor.knee.value = 10        // Gentle compression curve
      compressor.ratio.value = 4        // Moderate compression ratio
      compressor.attack.value = 0.005   // Fast attack
      compressor.release.value = 0.250  // Moderate release
      
      // Create gain node for consistent volume
      const gain = audioContext.createGain()
      gain.gain.value = 1.2 // Slight boost

      // Create destination for recording
      const dest = audioContext.createMediaStreamDestination()

      // Connect the audio processing chain
      streamSource
        .connect(compressor)
        .connect(gain)
        .connect(dest)

      // Set recording options
      let recordingOptions: MediaRecorderOptions = {
        mimeType: 'audio/webm;codecs=opus',  // Use OPUS for better compression
        audioBitsPerSecond: 128000  // 128kbps standard quality
      }

      console.log('Using codec:', recordingOptions.mimeType, 'at', recordingOptions.audioBitsPerSecond, 'bps')
      
      // Set up MediaRecorder with optimized settings
      this.mediaRecorder = new MediaRecorder(dest.stream, recordingOptions)
      
      this.chunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data)
        }
      }

      // Calculate recording duration in milliseconds
      const recordingDuration = Math.ceil((endTime - startTime) * 1000)
      console.log(`Starting recording for ${recordingDuration}ms (${startTime}s to ${endTime}s)`)
      
      // Start video playback from marker start
      videoControls.seek(startTime)
      await videoControls.play()

      // Start recording with small chunks for better quality
      this.mediaRecorder.start(10)

      // Clear any existing timeout
      if (this.stopTimeout) {
        clearTimeout(this.stopTimeout)
      }

      // Create a promise that resolves with the recorded audio
      return new Promise<Blob | null>((resolve) => {
        this.mediaRecorder!.onstop = () => {
          // Get the original mime type used for recording
          const mimeType = this.mediaRecorder?.mimeType || 'audio/wav'
          console.log('Recording stopped, chunks:', this.chunks.length)
          
          if (this.chunks.length === 0) {
            console.warn('No audio data was captured during recording')
            this.mediaRecorder = null
            resolve(null)
            return
          }
          
          // Combine chunks preserving the original format
          const audioBlob = new Blob(this.chunks, { type: mimeType })
          console.log('Created audio blob of size:', audioBlob.size, 'bytes')
          this.chunks = []
          
          // Stop all remaining tracks
          const tracks = this.mediaRecorder?.stream.getTracks()
          tracks?.forEach(track => track.stop())
          
          this.mediaRecorder = null
          resolve(audioBlob)
        }

        // Set up timer to stop recording at marker end
        this.stopTimeout = setTimeout(() => {
          console.log('Auto-stop timer triggered')
          
          // Force stop recording regardless of state
          videoControls.pause()
          
          if (this.mediaRecorder) {
            console.log('Stopping media recorder from auto-stop timer')
            try {
              this.mediaRecorder.stop()
            } catch (e) {
              console.error('Error stopping media recorder:', e)
            }
          }
          
          // Ensure all tracks are stopped
          if (displayStream) {
            const tracks = displayStream.getTracks();
            tracks.forEach(track => {
              console.log(`Stopping track: ${track.kind}`, track);
              track.stop();
            });
          }
          
          // Clear the timeout
          this.stopTimeout = null
          
          // Instead of resolving null, trigger proper stop so onstop handler creates blob
          if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            try {
              this.mediaRecorder.stop()
            } catch (e) {
              console.error('Error stopping media recorder during auto-stop:', e)
              resolve(null)
            }
          }
        }, recordingDuration + 500) // Add a small buffer to ensure we capture the full loop
      })
    } catch (error) {
      console.error('Error starting audio recording:', error)
      
      // Clean up any resources that might have been created
      if (displayStream) {
        console.log('Cleaning up display stream after error')
        displayStream.getTracks().forEach(track => {
          console.log(`Stopping track after error: ${track.kind}`, track)
          track.stop()
        })
      }
      
      // Clear any existing timeout
      if (this.stopTimeout) {
        clearTimeout(this.stopTimeout)
        this.stopTimeout = null
      }
      
      // Reset media recorder
      if (this.mediaRecorder) {
        try {
          this.mediaRecorder.stream.getTracks().forEach(track => track.stop())
        } catch (e) {
          console.error('Error stopping media recorder tracks:', e)
        }
        this.mediaRecorder = null
      }
      
      // Provide specific error messages but don't throw
      let errorMessage = 'Failed to start system audio recording. Please try again.';
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Screen sharing was denied. Please allow screen sharing and enable system audio to record.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Could not access system audio. Please ensure system audio sharing is enabled.';
        }
      }
      
      console.error(errorMessage);
      // Return null instead of throwing to handle the error gracefully
      return null;
    }
  }

  /**
   * Stop recording and return the recorded audio blob
   */
  stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        console.log('No recording in progress')
        return resolve(null)
      }

      this.mediaRecorder.onstop = () => {
        console.log('Recording stopped')
        // Get the original mime type used for recording
        const mimeType = this.mediaRecorder?.mimeType || 'audio/wav'
        console.log('Recording mime type:', mimeType, 'chunks:', this.chunks.length)
        
        if (this.chunks.length === 0) {
          console.warn('No audio data was captured during recording')
          
          // Stop all remaining tracks
          const tracks = this.mediaRecorder?.stream.getTracks()
          tracks?.forEach(track => {
            console.log(`Stopping track: ${track.kind}`, track);
            track.stop()
          })
          
          // Clear the timeout if it exists
          if (this.stopTimeout) {
            clearTimeout(this.stopTimeout)
            this.stopTimeout = null
          }
          
          this.mediaRecorder = null
          return resolve(null)
        }
        
        // Combine chunks preserving the original format
        const audioBlob = new Blob(this.chunks, { type: mimeType })
        console.log('Created audio blob of size:', audioBlob.size, 'bytes')
        this.chunks = []
        
        // Stop all remaining tracks
        const tracks = this.mediaRecorder?.stream.getTracks()
        tracks?.forEach(track => {
          console.log(`Stopping track: ${track.kind}`, track);
          track.stop()
        })
        
        // Clear the timeout if it exists
        if (this.stopTimeout) {
          clearTimeout(this.stopTimeout)
          this.stopTimeout = null
        }

        this.mediaRecorder = null
        resolve(audioBlob)
      }

      try {
        this.mediaRecorder.stop()
      } catch (error) {
        console.error('Error stopping media recorder:', error)
        this.mediaRecorder = null
        this.chunks = []
        resolve(null)
      }
    })
  }

  /**
   * Check if recording is currently in progress
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording'
  }

  /**
   * Download recorded audio as a file
   */
  static async downloadAudio(blob: Blob, filename: string, useMP3: boolean = false): Promise<void> {
    try {
      console.log('Downloading audio blob of size:', blob.size, 'bytes')
      const { blob: outputBlob, filename: outputFilename } = await prepareAudioForExport(blob, filename)

      console.log('Prepared audio file ready for download:', outputFilename, 'size:', outputBlob.size, 'bytes')
      
      const url = URL.createObjectURL(outputBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = outputFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error converting audio:', error)
      alert('Failed to convert and download audio file: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  /**
   * Save recorded audio to the Recordings folder under the root directory
   */
  static async saveAudioToRecordingsFolder(
    blob: Blob,
    filename: string,
    rootHandle: FileSystemDirectoryHandle
  ): Promise<string> {
    try {
      console.log('Saving audio blob of size:', blob.size, 'bytes')

      const recordingsHandle = await rootHandle.getDirectoryHandle(RECORDINGS_DIRECTORY, { create: true })
      const { blob: outputBlob, filename: outputFilename } = await prepareAudioForExport(blob, filename)
      const safeFilename = sanitizeFilename(outputFilename)
      const uniqueFilename = await getUniqueFilename(recordingsHandle, safeFilename)

      const fileHandle = await recordingsHandle.getFileHandle(uniqueFilename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(outputBlob)
      await writable.close()

      console.log('Saved recording to Recordings folder:', uniqueFilename)
      return uniqueFilename
    } catch (error) {
      console.error('Error saving recording to Recordings folder:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to save recording to the Recordings folder: ${message}`)
    }
  }
}
