import React from 'react';

interface SystemNoticeProps {
  text: string;
}

export default function SystemNotice({ text }: SystemNoticeProps) {
  return (
    <div className="text-sm text-gray-500 text-center py-2 italic">
      {text}
    </div>
  );
}