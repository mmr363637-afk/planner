// ===== مرز خطای هر تب — اگر یک صفحه کرش کند، کل اپ سفید نمی‌شود =====
// استفاده: دورِ محتوای هر تب در App، با key برابر تب تا با عوض شدن تب ریست شود.
// دکمه‌ی «بکاپ اضطراری» قبل از هر کاری، داده را نجات می‌دهد (آفلاین، بدون سرور).
import { Component, type ReactNode } from "react";
import { Button, Card } from "./ui";

interface ErrorBoundaryProps {
  /** نام فارسی تب برای پیام («مطالعه»، «آمار»…) */
  tabName: string;
  onHome: () => void;
  onBackup: () => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error): void {
    // فقط لاگ محلی — هیچ داده‌ای به جایی فرستاده نمی‌شود (اپ آفلاین است)
    console.error(`[crash:${this.props.tabName}]`, error);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Card className="my-6 text-center border-rose-200 dark:border-rose-900/50">
        <div className="text-4xl mb-2" aria-hidden="true">😅</div>
        <div className="font-extrabold text-slate-800 dark:text-slate-100">یه چیزی توی صفحه‌ی «{this.props.tabName}» خراب شد</div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          نگران نباش — داده‌هات سر جاشه و بقیه‌ی اپ سالمه. می‌تونی دوباره تلاش کنی یا برگردی خونه.
        </p>
        <details className="mt-3 text-right">
          <summary className="cursor-pointer text-[11px] text-slate-400">جزئیات فنی خطا</summary>
          <pre className="mt-1.5 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/60 rounded-lg p-2 overflow-x-auto" dir="ltr">
            {error.message}
            {error.stack ? `\n${error.stack.split("\n").slice(1, 4).join("\n")}` : ""}
          </pre>
        </details>
        <div className="flex flex-col gap-2 mt-4">
          <Button onClick={() => this.setState({ error: null })}>🔄 تلاش دوباره</Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={this.props.onHome}>🏠 رفتن به خانه</Button>
            <Button variant="outline" className="flex-1" onClick={this.props.onBackup}>💾 بکاپ اضطراری</Button>
          </div>
        </div>
      </Card>
    );
  }
}
