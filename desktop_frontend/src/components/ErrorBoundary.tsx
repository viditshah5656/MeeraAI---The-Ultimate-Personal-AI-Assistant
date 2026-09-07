import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI rendering error captured by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] w-full p-6 text-center rounded-xl bg-red-950/20 border border-red-500/30 backdrop-blur-md">
          <div className="w-12 h-12 mb-4 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 font-bold text-xl">
            ⚠️
          </div>
          <h3 className="text-lg font-semibold text-red-200 mb-2">
            Something went wrong rendering this component
          </h3>
          <p className="text-sm text-red-300/80 mb-4 max-w-md font-mono text-left bg-black/40 p-3 rounded overflow-auto max-h-32 text-xs">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors duration-150 shadow-lg shadow-red-900/30"
          >
            Retry / Reload Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
