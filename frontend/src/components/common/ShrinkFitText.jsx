import { useEffect, useRef } from 'react';

export default function ShrinkFitText({
  as: Component = 'span',
  className = '',
  minFontSize = 12,
  maxFontSize = 22,
  children,
  ...rest
}) {
  const containerRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    const fit = () => {
      let size = maxFontSize;
      textEl.style.fontSize = `${size}px`;
      const available = container.clientWidth;
      if (available <= 0) return;

      while (size > minFontSize && textEl.scrollWidth > available) {
        size -= 0.5;
        textEl.style.fontSize = `${size}px`;
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [children, minFontSize, maxFontSize]);

  return (
    <Component ref={containerRef} className={`shrink-fit-text ${className}`.trim()} {...rest}>
      <span ref={textRef} className="shrink-fit-text-inner">{children}</span>
    </Component>
  );
}
