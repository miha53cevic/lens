import { X } from 'lucide-react';
import { IconButton } from '../../ui/IconButton.tsx';
import './ModalHead.css';

/** A modal's title row; its close button closes the <dialog> natively. */
export function ModalHead({ title }: { title: string }) {
  return (
    <div className='modal-head'>
      <span className='modal-title'>{title}</span>
      <span className='spacer' />
      <form method='dialog'>
        <IconButton label='Close'>
          <X size={15} />
        </IconButton>
      </form>
    </div>
  );
}
