import JSZip from 'jszip';
import type { XapFile } from './converter';

/**
 * Creates a ZIP Blob containing the folder and all .xap files
 */
export async function createZipBlob(
  files: XapFile[],
  folderName: string,
  onProgress?: (percent: number, currentFile: string) => void
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(folderName) || zip;

  files.forEach((f) => {
    folder.file(f.name, f.content);
  });

  return await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        onProgress(metadata.percent, metadata.currentFile || '');
      }
    }
  );
}

/**
 * Triggers a browser download for any Blob or text content
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Downloads a single XAP file
 */
export function downloadSingleXap(file: XapFile): void {
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, file.name);
}

/**
 * Checks whether the browser supports the native File System Access API
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export interface SaveToDirectoryResult {
  success: boolean;
  savedPath?: string;
  filesWritten: number;
  error?: string;
}

/**
 * Saves all .xap files directly into a real directory on the user's filesystem
 * using the modern HTML5 File System Access API.
 */
export async function saveDirectlyToFolder(
  files: XapFile[],
  folderName: string,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<SaveToDirectoryResult> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Your browser does not support the File System Access API. Please use Download ZIP instead.');
  }

  try {
    // Prompt user to select parent folder
    const pickerOpts = {
      id: 'xap-export-destination',
      mode: 'readwrite' as const,
      startIn: 'downloads' as const,
    };

    // @ts-expect-error File System Access API types
    const parentHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker(pickerOpts);

    // Create the package folder inside the selected folder
    const targetFolderHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });

    let written = 0;
    for (const file of files) {
      if (onProgress) {
        onProgress(written + 1, files.length, file.name);
      }
      const fileHandle = await targetFolderHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
      written++;
    }

    return {
      success: true,
      savedPath: `${parentHandle.name}/${folderName}`,
      filesWritten: written,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, filesWritten: 0, error: 'User cancelled folder selection.' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, filesWritten: 0, error: message };
  }
}
