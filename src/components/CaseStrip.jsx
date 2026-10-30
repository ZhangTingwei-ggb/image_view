import {
  AlertTriangle,
  Check,
  ChevronRight,
  Crosshair,
  FolderTree,
  Keyboard,
  Layers3,
  Link2,
  Loader2,
  Move3d,
  RotateCcw,
  X,
} from 'lucide-react'

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value}`
}

export default function CaseStrip({
  dataset,
  selectedGroup,
  annotation,
  annotationLoading,
  annotationError,
  annotationOffset,
  imageOffset,
  alignTarget,
  hasIhcImage,
  hasIhcAnnotation,
  onSelectAlignTarget,
  onResetOffset,
  anchorMode,
  anchorPair,
  onToggleAnchorMode,
  onFinishAnchor,
  onCancelAnchor,
}) {
  const hasGeojson = Boolean(annotation?.geojson)
  const geojsonError = Boolean(annotationError || annotation?.error)
  const complete = Boolean(selectedGroup?.he && selectedGroup?.ihc)
  const annotationCount = [
    selectedGroup?.heGeojson,
    selectedGroup?.ihcGeojson,
  ].filter(Boolean).length
  const activeOffset = alignTarget === 'annotation' ? annotationOffset : imageOffset
  const canNudge = hasIhcImage || hasIhcAnnotation

  return (
    <div className="flex h-[44px] shrink-0 items-center justify-between gap-4 border-b border-[#354257] bg-[#202124] px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-[#69717c] 2xl:flex">
          <FolderTree className="h-3.5 w-3.5 text-[#657b9f]" />
          当前切片组
        </span>
        <span className="hidden h-3.5 w-px bg-[#3a3d44] 2xl:block" />
        <span
          className="hidden max-w-[180px] truncate text-[10px] text-[#767e89] lg:inline"
          title={dataset?.name}
        >
          {dataset?.name}
        </span>
        <ChevronRight className="hidden h-3 w-3 shrink-0 text-[#565d67] lg:block" />
        <span
          className="min-w-0 max-w-[200px] truncate text-[11.5px] font-medium text-[#d7dce4]"
          title={selectedGroup?.fullLabel || selectedGroup?.label}
        >
          {selectedGroup?.label || '未选择切片组'}
        </span>

        {selectedGroup && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-[2px] font-mono text-[7.5px] uppercase tracking-[0.05em] ${
              complete
                ? 'border-[#315842]/65 bg-[#1d362b]/55 text-[#7ed3ac]'
                : 'border-[#655033]/70 bg-[#352b1d]/55 text-[#cda66d]'
            }`}
            title={
              complete
                ? 'HE / IHC 已成对匹配'
                : !selectedGroup.he
                  ? '当前切片组缺少 HE 切片'
                  : '当前切片组缺少 IHC 切片'
            }
          >
            {complete ? (
              <Link2 className="h-2.5 w-2.5" />
            ) : (
              <AlertTriangle className="h-2.5 w-2.5" />
            )}
            {selectedGroup.isManual ? '手动配对' : complete ? '配对完成' : '单图'}
          </span>
        )}

        {selectedGroup?.geojson && (
          <span className="hidden shrink-0 items-center gap-1 rounded border border-[#294d40]/60 bg-[#1c3029]/45 px-1.5 py-[2px] font-mono text-[7.5px] uppercase tracking-[0.04em] text-[#76c7a6] xl:inline-flex">
            GEOJSON{annotationCount > 1 ? ` ×${annotationCount}` : ''}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canNudge ? (
          <>
            <div className="hidden items-center gap-1.5 rounded-md border border-[#383c43] bg-[#27282b] px-2 py-1 min-[1220px]:flex">
              <Keyboard className="h-3.5 w-3.5 text-[#758399]" strokeWidth={1.7} />
              <span className="text-[9px] text-[#89929e]">
                {alignTarget === 'image' ? '方向键移动 IHC 图像' : '方向键移动 IHC 标测'}
              </span>
              <span className="rounded bg-[#35383e] px-1 py-[1px] font-mono text-[7.5px] text-[#a7b0bc]">
                1 px
              </span>
            </div>

            <div className="flex h-[26px] overflow-hidden rounded-md border border-[#394552] bg-[#252a30]">
              <button
                type="button"
                onClick={() => onSelectAlignTarget('image')}
                disabled={!hasIhcImage}
                title="微调 IHC 图像位置"
                className={`flex items-center gap-1 px-2 font-mono text-[8.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  alignTarget === 'image'
                    ? 'bg-[#284f7d]/80 text-[#b7d8fa]'
                    : 'text-[#7e8b9c] hover:bg-white/[0.04] hover:text-[#c9d6e6]'
                }`}
              >
                <Move3d className="h-3 w-3" strokeWidth={1.8} />
                图像
                {imageOffset.x !== 0 || imageOffset.y !== 0 ? (
                  <span className="h-1 w-1 rounded-full bg-[#74b6f5]" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => onSelectAlignTarget('annotation')}
                disabled={!hasIhcAnnotation}
                title={
                  geojsonError
                    ? annotationError || annotation?.error
                    : '微调 IHC GeoJSON 标测位置'
                }
                className={`flex items-center gap-1 border-l border-[#394552] px-2 font-mono text-[8.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  alignTarget === 'annotation'
                    ? 'bg-[#204b3b]/80 text-[#a8e4ca]'
                    : 'text-[#7e8b9c] hover:bg-white/[0.04] hover:text-[#c9d6e6]'
                }`}
              >
                {annotationLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : geojsonError ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <Layers3 className="h-3 w-3" strokeWidth={1.8} />
                )}
                标测
                {annotationOffset.x !== 0 || annotationOffset.y !== 0 ? (
                  <span className="h-1 w-1 rounded-full bg-[#63d4a6]" />
                ) : null}
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleAnchorMode}
              disabled={!complete}
              title={
                complete
                  ? '锚点配准：在任一切片放置锚点，再拖动另一侧锚点对齐'
                  : '需要同时具备 HE 与 IHC 切片才能使用锚点配准'
              }
              className={`flex h-[26px] items-center gap-1.5 rounded-md border px-2 font-mono text-[8.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                anchorMode
                  ? 'border-[#8a6430]/80 bg-[#4a3517]/85 text-[#f0c987]'
                  : 'border-[#394552] bg-[#252a30] text-[#8ca0ba] hover:border-[#4c6280] hover:text-[#c8d8ee]'
              }`}
            >
              <Crosshair className="h-3 w-3" strokeWidth={1.8} />
              锚点
            </button>

            {anchorMode && (
              <div className="flex h-[26px] overflow-hidden rounded-md border border-[#8a6430]/70 bg-[#332612]/80">
                <button
                  type="button"
                  onClick={onFinishAnchor}
                  disabled={!anchorPair}
                  title="按两个锚点的偏移量移动 IHC 标测"
                  className="flex items-center gap-1 px-2 font-mono text-[8.5px] text-[#f0d19a] transition-colors hover:bg-[#5a411c]/80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check className="h-3 w-3" strokeWidth={2} />
                  完成
                </button>
                <button
                  type="button"
                  onClick={onCancelAnchor}
                  title="取消锚点配准（Esc）"
                  className="flex items-center gap-1 border-l border-[#8a6430]/50 px-2 font-mono text-[8.5px] text-[#c9ad82] transition-colors hover:bg-[#4a3517]/80"
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                  取消
                </button>
              </div>
            )}

            <div className="flex h-[26px] items-center overflow-hidden rounded-md border border-[#394047] bg-[#25272a]">
              <span className="border-r border-[#3b4047] px-2 font-mono text-[7.5px] uppercase tracking-[0.08em] text-[#6f7884]">
                offset
              </span>
              <span className="px-2 font-mono text-[9px] text-[#b9c3cf]">
                X {formatSigned(activeOffset.x)}
              </span>
              <span className="h-3 w-px bg-[#3b4047]" />
              <span className="px-2 font-mono text-[9px] text-[#b9c3cf]">
                Y {formatSigned(activeOffset.y)}
              </span>
              <button
                type="button"
                onClick={onResetOffset}
                disabled={activeOffset.x === 0 && activeOffset.y === 0}
                className="flex h-full w-7 items-center justify-center border-l border-[#3b4047] text-[#728091] transition-colors hover:bg-white/[0.05] hover:text-[#cfd7e2] disabled:cursor-default disabled:text-[#4e545c] disabled:hover:bg-transparent"
                title={`重置${alignTarget === 'image' ? '图像' : '标测'}偏移`}
                aria-label="重置当前偏移"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={1.8} />
              </button>
            </div>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[9.5px] text-[#66707c]">
            当前切片组没有可微调的 IHC 内容
          </span>
        )}
      </div>
    </div>
  )
}
