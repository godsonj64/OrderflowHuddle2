import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = this.state.error?.message || 'An unexpected error occurred';
      let parsedError = null;

      try {
        parsedError = JSON.parse(errorMessage);
        if (parsedError.error) {
          errorMessage = parsedError.error;
        }
      } catch (e) {
        // Not a JSON error message, ignore
      }

      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-ios-lg border border-gray-100 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
              !
            </div>
            <h1 className="text-2xl font-bold text-stone-900 mb-4">Oops! Something went wrong</h1>
            <p className="text-stone-600 mb-8">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-black text-[#EADDC5] px-6 py-3 rounded-2xl font-medium hover:bg-gray-900 transition-colors shadow-ios-sm"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
