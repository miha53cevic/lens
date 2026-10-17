import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './Button.tsx';
import { CopyCommand } from './CopyCommand.tsx';
import './ErrorBoundary.css';

interface CrashPanelProps {
  error: Error;
  /** What the page was drawing: "the review", "this screen" */
  what: string;
}

/** What a page shows instead of itself when it failed to draw: what broke, and the way back. */
export function CrashPanel({ error, what }: CrashPanelProps) {
  return (
    <main className='crash' role='alert'>
      <TriangleAlert size={20} className='crash-icon' />
      <h1>lens couldn't draw {what}</h1>
      <p className='crash-detail'>
        Reloading starts the page over. If it happens again, copy the error into a bug report.
      </p>
      <CopyCommand command={error.message || error.name} block />
      <Button variant='primary' onClick={() => location.reload()}>
        <RefreshCw size={14} />
        Reload
      </Button>
    </main>
  );
}

interface ErrorBoundaryProps {
  what: string;
  children: ReactNode;
}

/**
 * Catches an error while the page renders, so it shows CrashPanel instead of a blank page. A class
 * because React has no hook for it. It catches render errors only: an action that fails reports
 * to the page's status bar.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // the stack, for whoever opens the page's devtools
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.error ? <CrashPanel error={this.state.error} what={this.props.what} /> : this.props.children;
  }
}
