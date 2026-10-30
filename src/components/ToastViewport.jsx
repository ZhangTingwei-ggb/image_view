import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react'

const META = {
  success: {
    Icon: CheckCircle2,
    card: 'border-[#315b47]/80 bg-[#1b2b24]/96',
    icon: 'text-[#6cdcae]',
    title: 'text-[#ccecdf]',
  },
  error: {
    Icon: AlertTriangle,
    card: 'border-[#6e4439]/80 bg-[#2c211e]/96',
    icon: 'text-[#f09578]',
    title: 'text-[#f0d5cd]',
  },
  warning: {
    Icon: AlertTriangle,
    card: 'border-[#625034]/80 bg-[#2b261d]/96',
    icon: 'text-[#dfb66e]',
    title: 'text-[#ebddc2]',
  },
  info: {
    Icon: Info,
    card: 'border-[#354c70]/80 bg-[#202833]/96',
    icon: 'text-[#80abea]',
    title: 'text-[#d5e3f7]',
  },
}

export default function ToastViewport({ toasts, onDismiss }) {
  if (!toasts.length) return null

  return (
    <div
      className="pointer-events-none fixed right-4 top-[76px] z-[10000] flex w-[min(350px,calc(100vw-32px))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const meta = META[toast.type] || META.info
        const Icon = meta.Icon
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl ${meta.card}`}
            role="status"
          >
            <Icon className={`mt-[1px] h-4 w-4 shrink-0 ${meta.icon}`} strokeWidth={1.8} />
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-medium leading-4 ${meta.title}`}>
                {toast.title}
              </p>
              {toast.message && (
                <p className="mt-0.5 line-clamp-3 text-[9.5px] leading-4 text-[#98a1ad]">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#7d8590] transition-colors hover:bg-white/[0.06] hover:text-[#d3d9e1]"
              aria-label="关闭提示"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
