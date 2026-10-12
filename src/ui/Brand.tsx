import clsx from 'clsx';
import './Brand.css';

interface BrandProps {
  /** A heading where the name is the screen's title (Start), a span in a bar */
  as?: 'span' | 'h1';
  className?: string;
}

/** The name, as every page of lens writes it. */
export function Brand({ as: Tag = 'span', className }: BrandProps) {
  return (
    <Tag className={clsx('brand', className)}>
      lens<em>.</em>
    </Tag>
  );
}
