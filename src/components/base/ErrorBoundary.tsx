import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] React render error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
          <div className="max-w-lg w-full bg-white rounded-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <i className="ri-error-warning-line text-red-500 text-2xl" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">页面加载异常</h2>
            <p className="text-sm text-gray-500 mb-4">
              应用在渲染过程中遇到了错误，请尝试刷新页面。如果问题持续，请联系管理员。
            </p>
            <div className="bg-gray-100 rounded-lg p-3 mb-4 text-left">
              <p className="text-xs font-mono text-red-600 break-all">
                {this.state.error?.message || '未知错误'}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line mr-2" />
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}