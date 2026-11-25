// What TypeScript says of the name under the pointer (actions/lsp.ts): the declaration in the
// code's own colors, then its doc. The doc is the reviewed code's own text, so its markdown is
// drawn with HTML, links and images off (lspDocHtml).

import { Info } from 'lucide-react';
import { useLens } from '../store.ts';
import { HoverCard } from '../../ui/HoverCard.tsx';
import { escapeHtml } from '../shared.ts';
import { lineHtml } from '../wordDiff.ts';
import { lspDocHtml } from '../model/lspDoc.ts';

export function LspHover() {
  const hover = useLens((state) => state.lspHover);
  if (!hover) return null;
  const { info, tokens, unavailable } = hover;
  const codeHtml = tokens ? tokens.map((line) => lineHtml(line)).join('\n') : escapeHtml(info?.code ?? '');
  return (
    // as an editor's hover: wide enough for a signature, the doc right under it (no rule), in reading size
    <HoverCard
      key={hover.key}
      anchor={hover.anchor}
      id='lsp-hover'
      className='max-w-[min(760px,calc(var(--screen-w)-16px))] divide-y-0 [&>*]:px-2 [&>*]:py-2 [&>*+*]:pt-1'
    >
      {info?.code && (
        <pre
          data-part='hover-code'
          className='font-code text-code break-words whitespace-pre-wrap'
          dangerouslySetInnerHTML={{ __html: codeHtml }}
        />
      )}
      {info?.doc && (
        <div
          data-part='hover-doc'
          className='answer text-md/[1.6] [&>:last-child]:mb-0'
          dangerouslySetInnerHTML={{ __html: lspDocHtml(info.doc) }}
        />
      )}
      {unavailable && (
        <p data-part='hover-unavailable' className='flex items-center gap-2 text-muted'>
          <Info size={14} className='flex-none' />
          <span>TypeScript: {unavailable}</span>
        </p>
      )}
    </HoverCard>
  );
}
