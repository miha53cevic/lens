import { useState, type MouseEvent } from 'react';
import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import './CopyCommand.css';

interface CopyCommandProps {
  command: string;
  /** its own row (the empty Summary page) instead of inline in a sentence */
  block?: boolean;
}

/** A command to run in the agent: click it to copy it. The copy icon turns into a check once it's copied. */
export function CopyCommand({ command, block = false }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    const text = event.currentTarget.querySelector('.copy-cmd-text')!;
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
    <button type='button' className={clsx('copy-cmd', block && 'block', copied && 'copied')} onClick={copy}>
      <span className='copy-cmd-text'>{command}</span>
      {copied ? <Check size={block ? 14 : 12} /> : <Copy size={block ? 14 : 12} />}
    </button>
  );
}
