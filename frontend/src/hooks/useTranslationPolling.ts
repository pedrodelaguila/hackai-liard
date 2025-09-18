import { useCallback } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const useTranslationPolling = (onComplete: () => void) => {
  const pollTranslationStatus = useCallback(async (urn: string) => {
    console.log('Starting translation polling for URN:', urn);

    const checkStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/aps/status/${urn}`);
        const data = await res.json();

        console.log('Translation status:', data.status, 'Progress:', data.progress);

        if (data.status === 'success') {
          console.log('Translation completed successfully!');
          onComplete();
        } else if (data.status === 'failed') {
          console.error('Translation failed');
        } else {
          // Still processing, continue polling
          setTimeout(checkStatus, 5000); // Poll every 5 seconds
        }
      } catch (error) {
        console.error('Error checking status:', error);
        // Retry after error
        setTimeout(checkStatus, 5000);
      }
    };

    // Start polling immediately
    checkStatus();
  }, [onComplete]);

  return { pollTranslationStatus };
};