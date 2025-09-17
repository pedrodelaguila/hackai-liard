import { useState, useEffect, useRef } from 'react';

interface UseTypewriterOptions {
  text: string;
  speed?: number; // Velocidad en ms por carácter
  enabled?: boolean; // Si está habilitado el efecto
  onComplete?: () => void; // Callback cuando termine de escribir
}

export const useTypewriter = ({ 
  text, 
  speed = 30, 
  enabled = true,
  onComplete 
}: UseTypewriterOptions) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Si el efecto está deshabilitado, mostrar todo el texto inmediatamente
    if (!enabled) {
      setDisplayedText(text);
      setIsTyping(false);
      return;
    }

    // Si el texto cambió, resetear el estado
    if (text !== displayedText || indexRef.current === 0) {
      setDisplayedText('');
      indexRef.current = 0;
      setIsTyping(true);
    }

    // Función para escribir el siguiente carácter
    const typeNextChar = () => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current++;
        timeoutRef.current = setTimeout(typeNextChar, speed);
      } else {
        setIsTyping(false);
        onComplete?.();
      }
    };

    // Limpiar timeout anterior si existe
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Solo empezar a escribir si tenemos texto y el efecto está habilitado
    if (text && enabled && indexRef.current < text.length) {
      timeoutRef.current = setTimeout(typeNextChar, speed);
    }

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, enabled, onComplete]);

  // Reset cuando el texto cambia completamente
  useEffect(() => {
    indexRef.current = 0;
    setDisplayedText('');
  }, [text]);

  return { displayedText, isTyping };
};