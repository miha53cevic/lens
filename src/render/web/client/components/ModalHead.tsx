/** A modal's title row; its close button closes the <dialog> natively. */
export function ModalHead({ title }: { title: string }) {
  return (
    <div className='modal-head'>
      <span className='modal-title'>{title}</span>
      <span className='spacer' />
      <form method='dialog'>
        <button>close</button>
      </form>
    </div>
  );
}
