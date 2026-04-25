import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || '不明なエラー',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI Runtime Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-2xl w-full bg-white border-2 border-red-200 rounded-2xl p-6 shadow">
            <h2 className="text-xl font-bold text-red-700 mb-2">画面表示エラーが発生しました</h2>
            <p className="text-sm text-gray-700 mb-4">
              白画面を回避するため、エラー表示モードに切り替えています。詳細はコンソールを確認してください。
            </p>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 break-words">
              {this.state.message}
            </div>
            <button
              type="button"
              className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold"
              onClick={() => window.location.reload()}
            >
              再読み込み
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

