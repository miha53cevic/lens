import { cn } from './cn.ts';

interface BrandProps {
  /** A heading where the name is the screen's title (Start), a span in a bar */
  as?: 'span' | 'h1';
  className?: string;
}

/** The name, as every page of lens writes it. */
export function Brand({ as: Tag = 'span', className }: BrandProps) {
  return (
    <Tag
      data-part='brand'
      className={cn('m-0 mr-1 flex-none font-serif text-xl leading-none font-bold tracking-[-0.01em]', className)}
    >
      lens<em className='text-accent not-italic'>.</em>
    </Tag>
  );
}
