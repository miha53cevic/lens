import { File, FileCode, FileImage, FileJson, FileText } from 'lucide-react';

const KIND_ICONS = [
  {
    icon: FileCode,
    pattern:
      /\.(c|cc|cjs|cpp|cs|css|go|h|hpp|html|java|jsx?|kt|less|lua|m|mjs|php|py|rb|rs|scss|sh|sql|svelte|swift|tsx?|vue|zig)$/,
  },
  { icon: FileJson, pattern: /\.(json|jsonc|json5)$/ },
  { icon: FileText, pattern: /\.(md|mdx|txt|rst|ya?ml|toml|ini|lock|csv)$/ },
  { icon: FileImage, pattern: /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif)$/ },
];

/** A file's icon by its kind, from its name: code, data, text, an image, or a plain file. */
export function KindIcon({ name }: { name: string }) {
  const Icon = KIND_ICONS.find((kind) => kind.pattern.test(name.toLowerCase()))?.icon ?? File;
  return <Icon data-part='kind-icon' className='flex-none text-faint' size={13} />;
}
