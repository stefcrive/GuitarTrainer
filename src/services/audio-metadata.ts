import { AudioMetadata, AudioFile } from '@/types/audio'

const METADATA_FILE = 'audio-metadata.json'

async function getMetadataFileHandle(directoryHandle: FileSystemDirectoryHandle) {
  try {
    return await directoryHandle.getFileHandle(METADATA_FILE, { create: true })
  } catch (error) {
    console.error('Error accessing metadata file:', error)
    throw error
  }
}

async function readMetadataFile(directoryHandle: FileSystemDirectoryHandle): Promise<Record<string, AudioMetadata>> {
  const fileHandle = await getMetadataFileHandle(directoryHandle)
  
  try {
    const file = await fileHandle.getFile()
    const content = await file.text()
    return content ? JSON.parse(content) : {}
  } catch (error) {
    console.error('Error reading metadata file:', error)
    return {}
  }
}

async function writeMetadataFile(directoryHandle: FileSystemDirectoryHandle, metadata: Record<string, AudioMetadata>) {
  const fileHandle = await getMetadataFileHandle(directoryHandle)
  
  try {
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(metadata, null, 2))
    await writable.close()
  } catch (error) {
    console.error('Error writing metadata file:', error)
    throw error
  }
}

export async function getAudioMetadata(audioFile: AudioFile, directoryHandle: FileSystemDirectoryHandle): Promise<AudioMetadata> {
  const metadata = await readMetadataFile(directoryHandle)
  
  return metadata[audioFile.path] || {
    id: audioFile.path,
    path: audioFile.path,
    title: audioFile.name,
    tags: [],
    loopRegion: {
      start: 0,
      end: 0,
      enabled: false
    },
    markers: [],
    playbackRate: 1
  }
}

export async function saveAudioMetadata(
  audioFile: AudioFile,
  metadata: Partial<AudioMetadata>,
  directoryHandle: FileSystemDirectoryHandle
) {
  const allMetadata = await readMetadataFile(directoryHandle)
  const existingMetadata = allMetadata[audioFile.path] || await getAudioMetadata(audioFile, directoryHandle)
  
  allMetadata[audioFile.path] = {
    ...existingMetadata,
    ...metadata,
    id: audioFile.path
  }
  
  await writeMetadataFile(directoryHandle, allMetadata)
}

export async function getAllAudioMetadata(directoryHandle: FileSystemDirectoryHandle): Promise<Record<string, AudioMetadata>> {
  return await readMetadataFile(directoryHandle)
}