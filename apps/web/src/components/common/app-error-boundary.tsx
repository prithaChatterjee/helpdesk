import { Component, type ReactNode } from 'react';
import { AppErrorFallback } from './app-error-fallback';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * Shows `AppErrorFallback` instead of a blank page when rendering crashes. Reporting happens in the
 * root's `onCaughtError` hook (`reportReactError`), so this only swaps the UI.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    return this.state.hasError ? <AppErrorFallback /> : this.props.children;
  }
}
