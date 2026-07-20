import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';

type Copy = { eyebrow: string; title: string; body: string; reload: string; backup: string; backupFailed: string };

const COPY: Record<'en' | 'ru' | 'ja', Copy> = {
  en: {
    eyebrow: 'Recovery mode',
    title: 'Nebulla could not open this screen',
    body: 'Your local data is still on this device. Save a recovery copy, then reload the app.',
    reload: 'Reload app',
    backup: 'Save recovery data',
    backupFailed: 'Recovery data is not available in this browser.',
  },
  ru: {
    eyebrow: 'Режим восстановления',
    title: 'Nebulla не смогла открыть этот экран',
    body: 'Локальные данные остались на устройстве. Сохраните резервную копию и перезапустите приложение.',
    reload: 'Перезапустить',
    backup: 'Сохранить данные',
    backupFailed: 'В этом браузере данные для восстановления недоступны.',
  },
  ja: {
    eyebrow: '復旧モード',
    title: 'この画面を開けませんでした',
    body: '端末内のデータは残っています。復旧用データを保存してから、アプリを再読み込みしてください。',
    reload: '再読み込み',
    backup: '復旧データを保存',
    backupFailed: 'このブラウザでは復旧データを取得できません。',
  },
};

const currentCopy = (): Copy => {
  const lang = typeof navigator === 'undefined' ? 'en' : navigator.language.toLowerCase();
  return COPY[lang.startsWith('ru') ? 'ru' : lang.startsWith('ja') ? 'ja' : 'en'];
};

interface State {
  error: Error | null;
  backupError: boolean;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, backupError: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, backupError: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Nebulla render failure', error, info.componentStack);
  }

  private saveRecovery = () => {
    try {
      const raw = localStorage.getItem('ai-scheduler-store');
      if (!raw) throw new Error('missing store');
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nebulla-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      this.setState({ backupError: true });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    const copy = currentCopy();

    return (
      <main className="min-h-[100dvh] bg-[#06070d] text-[#eceef8] px-5 py-10 grid place-items-center">
        <section className="w-full max-w-md rounded-[28px] border border-[#262b45] bg-[#0c0e18] p-6 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/10 text-amber-300 grid place-items-center mb-5">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#8d93b3]">{copy.eyebrow}</p>
          <h1 className="mt-2 text-[24px] leading-tight font-bold">{copy.title}</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-[#a8aecb]">{copy.body}</p>
          {this.state.backupError && <p role="alert" className="mt-3 text-[12px] text-amber-300">{copy.backupFailed}</p>}
          <div className="mt-6 grid gap-2">
            <button onClick={() => location.reload()} className="h-12 rounded-2xl bg-[#6467f2] text-white font-bold flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" />{copy.reload}
            </button>
            <button onClick={this.saveRecovery} className="h-12 rounded-2xl border border-[#262b45] bg-[#121524] text-[#eceef8] font-bold flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />{copy.backup}
            </button>
          </div>
        </section>
      </main>
    );
  }
}

