import { useEffect, useRef, useCallback } from 'react';

interface UseAutoScrollOptions {
  dependency?: any; // Dependencia que trigger el scroll (ej. messages.length)
  enabled?: boolean;
  smooth?: boolean;
}

export const useAutoScroll = ({ 
  dependency, 
  enabled = true, 
  smooth = true 
}: UseAutoScrollOptions = {}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Función para hacer scroll al final
  const scrollToBottom = useCallback((force = false) => {
    if (!enabled || (!force && isUserScrollingRef.current)) return;

    const container = containerRef.current;
    if (container) {
      const scrollOptions: ScrollToOptions = {
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      };
      container.scrollTo(scrollOptions);
    }
  }, [enabled, smooth]);

  // Detectar cuando el usuario está haciendo scroll manualmente
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px de tolerancia

    // Si el usuario no está cerca del final, marcar como scroll manual
    isUserScrollingRef.current = !isAtBottom;

    // Limpiar el timeout anterior
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Después de 1 segundo sin scroll, permitir auto-scroll de nuevo
    scrollTimeoutRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 1000);
  }, []);

  // Auto-scroll cuando cambie la dependencia (ej. nuevos mensajes)
  useEffect(() => {
    if (dependency !== undefined) {
      // Delay más largo para permitir que el DOM se actualice completamente
      setTimeout(() => scrollToBottom(true), 200);
    }
  }, [dependency, scrollToBottom]);

  // Configurar el listener de scroll
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    scrollToBottom
  };
};