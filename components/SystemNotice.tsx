import React from 'react';

interface SystemNoticeProps {
  text: string;
}

export default function SystemNotice({ text }: SystemNoticeProps) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/10 text-xs uppercase tracking-[0.3em] text-slate-200/80">
        <span className="text-base">•</span>
        {text}
      </div>
    </div>
  );
}