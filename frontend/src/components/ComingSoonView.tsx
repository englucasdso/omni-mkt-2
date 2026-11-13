import React from 'react';
import { Construction } from 'lucide-react';

interface Props {
  title: string;
  description: string;
}

/** Tela reservada para uma funcionalidade que ainda será construída */
export const ComingSoonView: React.FC<Props> = ({ title, description }) => (
  <section className="flex-1 flex items-center justify-center py-24">
    <div className="max-w-md text-center space-y-3">
      <div className="w-12 h-12 mx-auto rounded-xl bg-omni-mist border border-omni-line text-omni-muted flex items-center justify-center">
        <Construction className="w-5 h-5" />
      </div>
      <h2 className="text-lg font-heading font-bold text-omni-ink">{title}</h2>
      <p className="text-sm text-omni-ink-secondary leading-relaxed">{description}</p>
      <span className="inline-block px-2.5 py-1 rounded-full border border-omni-line text-[11px] font-medium text-omni-muted">
        Em construção
      </span>
    </div>
  </section>
);
