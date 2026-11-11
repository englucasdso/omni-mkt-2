import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface HoverHintProps {
  /** O que fica sempre visível (selo, ícone, valor) */
  children: React.ReactNode;
  /** O que aparece ao passar o mouse ou focar com o teclado */
  hint: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

const WIDTH = 288;

/**
 * Detalhe escondido até o usuário pedir: aparece no hover ou no foco.
 * Renderiza por cima de tudo (portal), para não ser cortado por tabelas e modais.
 */
export const HoverHint: React.FC<HoverHintProps> = ({ children, hint, className = '', align = 'left' }) => {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const rawLeft = align === 'right' ? r.right - WIDTH : r.left;
    const left = Math.max(8, Math.min(rawLeft, window.innerWidth - WIDTH - 8));
    setPos({ left, top: r.bottom + 6 });
  };
  const hide = () => {
    timer.current = window.setTimeout(() => setPos(null), 100);
  };

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
            className="fixed z-[300] rounded-lg border border-amber-200 bg-white shadow-lg p-2.5 text-[11.5px] leading-relaxed text-omni-ink font-sans text-left pointer-events-none"
          >
            {hint}
          </span>,
          document.body
        )}
    </span>
  );
};
