import { FileStack, FolderDown, Loader2, ShieldCheck } from 'lucide-react'

export default function ImportOverlay({ progress }) {
  const total = progress?.total || 0
  const processed = progress?.processed || 0
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 6

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center bg-[#111316]/68 p-6 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-progress-title"
    >
      <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-[#3c424c] bg-[#25272b] shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <div className="relative border-b border-[#373b42] bg-[linear-gradient(145deg,#2d3036,#26282c)] px-5 pb-4 pt-5">
          <div className="absolute right-0 top-0 h-24 w-24 bg-[radial-gradient(circle_at_top_right,rgba(79,125,243,0.16),transparent_65%)]" />
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#47649b]/60 bg-[#293a58]/70 text-[#8eb5ff] shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
              <FolderDown className="h-5 w-5" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2
                  id="import-progress-title"
                  className="text-[13px] font-medium text-[#e2e7ee]"
                >
                  正在建立切片分组
                </h2>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7fa6ef]" />
              </div>
              <p className="mt-1 text-[10px] leading-4 text-[#828b98]">
                扫描切片与标注目录，自动识别 he / ihc / *_geo 结构，并按文件名最长公共前缀匹配。
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-[#9ba5b3]">
              <FileStack className="h-3.5 w-3.5 shrink-0 text-[#77859a]" />
              <span className="truncate">{progress?.stage || '准备读取文件'}</span>
            </span>
            <span className="shrink-0 font-mono text-[9.5px] text-[#7e8896]">
              {total > 0 ? `${Math.min(processed + 1, total)} / ${total}` : '准备中'}
            </span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#191b1f] ring-1 ring-white/[0.035]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#3865d2] via-[#5685f2] to-[#7aa4ff] transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-[8.5px] text-[#606976]">
              {progress?.fileName || '扫描支持的文件类型：TIFF / GEOJSON'}
            </p>
            <span className="shrink-0 font-mono text-[8.5px] text-[#75849a]">
              {percent}%
            </span>
          </div>

          <div className="mt-4 flex items-center gap-1.5 border-t border-[#34383f] pt-3 text-[8.5px] text-[#687280]">
            <ShieldCheck className="h-3 w-3 text-[#5d8b7a]" />
            所有图像均在浏览器本地解析，不会上传服务器
          </div>
        </div>
      </div>
    </div>
  )
}
