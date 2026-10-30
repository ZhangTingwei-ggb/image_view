import {
  Download,
  FolderPlus,
  Link2,
  Loader2,
  PanelLeft,
  Unlink,
} from 'lucide-react'

function BrandMark() {
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-[#4e7fe9]/50 bg-gradient-to-br from-[#3568dc] to-[#1d3672] shadow-[0_5px_18px_rgba(25,61,139,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.24),transparent_45%)]" />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="relative h-[21px] w-[21px] text-white"
        aria-hidden="true"
      >
        <rect
          x="4.25"
          y="4.25"
          width="10.1"
          height="14.5"
          rx="2.15"
          stroke="currentColor"
          strokeWidth="1.3"
          opacity="0.75"
        />
        <rect
          x="9.6"
          y="7.4"
          width="10.15"
          height="12.35"
          rx="2.15"
          fill="#1a346f"
          fillOpacity="0.45"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M12.45 12.1h4.45m-2.22-2.23v4.46"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <circle cx="17.95" cy="7.05" r="1.5" fill="#6ee7b7" />
      </svg>
    </div>
  )
}

export default function TopBar({
  syncEnabled,
  onToggleSync,
  onImport,
  onExport,
  canExport,
  isImporting,
  exportFileName,
  onToggleSidebar,
}) {
  const exportTitle = canExport
    ? `下载当前 IHC 配准后的 GeoJSON${exportFileName ? `：${exportFileName}` : ''}`
    : '当前病例没有可导出的 IHC GeoJSON 标注'

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-stretch border-b border-[#354257] bg-[#252629]">
      <div className="flex shrink-0 items-center gap-2.5 border-r border-[#354257] px-3 sm:gap-3 min-[960px]:w-[300px] min-[960px]:px-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#3d424b] bg-[#2c2e33] text-[#8f98a4] transition-colors hover:border-[#536581] hover:text-[#d2dded] min-[960px]:hidden"
          aria-label="显示或隐藏文件目录"
          title="文件目录"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.7} />
        </button>
        <BrandMark />
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-[0.02em] text-[#f0f2f5]">
              PathoAlign
            </span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.18em] text-[#6f7d96] sm:inline">
              lab
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] tracking-[0.08em] text-[#89909b]">
            HE / IHC 智能切片配准
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 2xl:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="hidden items-center gap-2 xl:flex">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[#717985]">
              视图布局
            </span>
            <div className="flex h-7 items-center gap-1.5 rounded-md border border-[#41464f] bg-[#2c2e33] px-2.5 text-[11px] text-[#c3cad5]">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="1.5"
                  y="2.5"
                  width="5.4"
                  height="11"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="9.1"
                  y="2.5"
                  width="5.4"
                  height="11"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              2 View · 横排
            </div>
          </div>

          <span className="hidden h-4 w-px bg-[#3b3e45] xl:block" />

          <button
            type="button"
            role="switch"
            aria-checked={syncEnabled}
            aria-label="切换双屏联动"
            onClick={onToggleSync}
            title="同步双侧视图的缩放与平移"
            className={`group flex h-8 items-center gap-2 rounded-md border px-2.5 transition-all ${
              syncEnabled
                ? 'border-[#3961ad]/60 bg-[#263752]/55 text-[#b7ceff]'
                : 'border-[#41464f] bg-[#2b2d31] text-[#8a919c] hover:border-[#525863]'
            }`}
          >
            {syncEnabled ? (
              <Link2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            ) : (
              <Unlink className="h-3.5 w-3.5" strokeWidth={1.8} />
            )}
            <span className="hidden whitespace-nowrap text-[11px] font-medium md:inline">
              双屏联动
            </span>
            <span
              className={`relative ml-0.5 inline-block h-4 w-[30px] shrink-0 rounded-full transition-colors ${
                syncEnabled ? 'bg-[#4f7df3]' : 'bg-[#474b53]'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute left-[2px] top-[2px] h-3 w-3 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-150 ${
                  syncEnabled ? 'translate-x-[14px]' : 'translate-x-0'
                }`}
              />
            </span>
          </button>

          <span className="hidden whitespace-nowrap text-[10px] text-[#6f7681] 2xl:block">
            View 1 / View 2 同步缩放与平移
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onImport}
            disabled={isImporting}
            aria-label="导入 HE / IHC 数据"
            title="导入 HE / IHC 图像与 GeoJSON：四个目录、四个文件或直接拖入"
            className="flex h-9 items-center gap-2 rounded-lg border border-[#47536a] bg-[#2d323b] px-2.5 text-[12px] font-medium text-[#d7dde7] shadow-sm transition-all hover:border-[#5b7fc2] hover:bg-[#343b47] disabled:cursor-wait disabled:opacity-60 sm:px-3"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-[#8eb5ff]" />
            ) : (
              <FolderPlus className="h-4 w-4 text-[#84aaf7]" strokeWidth={1.8} />
            )}
            <span className="hidden sm:inline">
              {isImporting ? '正在导入' : '导入数据'}
            </span>
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            title={exportTitle}
            aria-label="导出配准后的 GeoJSON"
            className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[12px] font-medium transition-all sm:px-3 ${
              canExport
                ? 'border-[#6b95ff]/30 bg-[#4f7df3] text-white shadow-[0_4px_16px_rgba(56,100,220,0.24)] hover:border-[#89abff]/50 hover:bg-[#5d89f7]'
                : 'cursor-not-allowed border-[#42464e] bg-[#303237] text-[#707680]'
            }`}
          >
            <Download className="h-4 w-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">导出 GeoJSON</span>
          </button>
        </div>
      </div>
    </header>
  )
}
