import { useCallback } from 'react';

const BACKEND_URL = 'http://localhost:4000';

interface UploadResponse {
  dwgId: string;
  urn?: string;
  message: string;
}

export const useDwgUpload = (onUploadComplete: (dwgId: string, urn?: string) => void) => {
  const uploadDwg = useCallback(async (dwgFile: File): Promise<UploadResponse> => {
    try {
      const formData = new FormData();
      formData.append('dwg', dwgFile);

      const response = await fetch(`${BACKEND_URL}/upload-dwg`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result: UploadResponse = await response.json();
      console.log('Upload result:', result);

      onUploadComplete(result.dwgId, result.urn);

      return result;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }, [onUploadComplete]);

  return { uploadDwg };
};