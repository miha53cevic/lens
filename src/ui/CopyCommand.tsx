import { useState, type MouseEvent } from 'react';
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';

// the hover tint over its own surface, as ui/Button's: the selected look is for what's picked
const COPY_COMMAND =
  'max-w-full cursor-pointer items-center rounded-sm border text-text [transition:background_var(--motion),border-color_var(--motion)] [&_svg]:flex-none [&_svg]:text-muted hover:[&_svg]:text-accent';
const INLINE =
  'inline-flex gap-1 border-line-strong bg-surface-2 pr-1 pl-2 align-baseline font-mono text-sm/[1.6] hover:bg-[linear-gradient(var(--hover-bg),var(--hover-bg)),var(--surface-2)]';
// its own row
const BLOCK =
  'my-3 flex w-full justify-between gap-2 border-line bg-surface px-3 py-2 font-mono text-md/[1.6] hover:bg-[linear-gradient(var(--hover-bg),var(--hover-bg)),var(--surface)]';

interface CopyCommandProps {
  command: string;
  /** its own row (the empty Summary page) instead of inline in a sentence */
  block?: boolean;
}

/** A command to run in the agent: click it to copy it. The copy icon turns into a check once it's copied. */
export function CopyCommand({ command, block = false }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    const text = event.currentTarget.firstElementChild!;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // no clipboard (an insecure origin, a denied permission): select it for Ctrl C
      getSelection()?.selectAllChildren(text);
    }
  };
  return (
    <button
      type='button'
      data-part='copy-cmd'
      data-copied={copied || undefined}
      className={clsx(COPY_COMMAND, block ? BLOCK : INLINE, copied && '[&_svg]:text-add hover:[&_svg]:text-add')}
      onClick={copy}
    >
      <span data-part='copy-cmd-text' className='overflow-hidden text-ellipsis whitespace-nowrap select-text'>
        {command}
      </span>
      {copied ? <Check size={block ? 14 : 12} /> : <Copy size={block ? 14 : 12} />}
    </button>
  );
}
