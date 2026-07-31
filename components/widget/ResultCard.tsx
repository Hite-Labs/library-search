'use client';

import { MEDIA_BADGES } from '@/components/MediaBadge';

interface ResultCardProps {
  title: string;
  description: string;
  mediaType: string;
  contentPageUrl: string | null;
  similarity: number;
}

export function ResultCard({ title, description, mediaType, contentPageUrl, similarity }: ResultCardProps) {
  const badge = MEDIA_BADGES[mediaType] ?? { label: mediaType, className: 'bg-stone-100 text-stone-600' };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-800 leading-snug">{title}</h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-xs text-stone-500 leading-relaxed">{description}</p>
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-stone-400">{Math.round(similarity * 100)}% match</span>
        {contentPageUrl ? (
          <a
            href={contentPageUrl}
            target="_parent"
            className="text-xs font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2"
          >
            View resource →
          </a>
        ) : (
          <span className="text-xs text-stone-300">Link unavailable</span>
        )}
      </div>
    </div>
  );
}
