import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  File as FileIcon,
  FileJson,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Loader2,
  Microscope,
  UploadCloud,
  X,
} from 'lucide-react'
import { FILE_ROLE, getExtension } from '../utils/grouping'
import {
  collectDroppedEntries,
  getSelectionLabel,
  splitEntriesByRole,
} from '../utils/importSources'

const SLOTS = [
  {
    key: 'heImages',
    title: 'HE 图像',
    description: '苏木精 - 伊红切片',
    icon: ImageIcon,
    tone: 'rose',
    prefix: 'he',
    role: FILE_ROLE.HE,
    required: true,
    extension: 'tif',
  },
  {
    key: 'heGeojson',
    title: 'HE GeoJSON',
    description: 'HE 标测范围',
    icon: FileJson,
    tone: 'coral',
    prefix: 'he_geo',
    role: FILE_ROLE.GEOJSON,
    annotationSide: FILE_ROLE.HE,
    required: false,
    extension: 'geojson',
  },
  {
    key: 'ihcImages',
    title: 'IHC 图像',
    description: '免疫组化切片',
    icon: Microscope,
    tone: 'amber',
    prefix: 'ihc',
    role: FILE_ROLE.IHC,
    required: true,
    extension: 'tif',
  },
  {
    key: 'ihcGeojson',
    title: 'IHC GeoJSON',
    description: 'IHC 标测范围',
    icon: FileJson,
    tone: 'emerald',
    prefix: 'ihc_geo',
    role: FILE_ROLE.GEOJSON,
    annotationSide: FILE_ROLE.IHC,
    required: false,
    extension: 'geojson',
  },
]

const EMPTY_SELECTION = {
  entries: [],
  sourceKind: null,
  error: '',
}

const TONE = {
  rose: {
    card: 'border-[#59404a] bg-[#2a2327]',
    selected: 'border-[#a35770] bg-[#30232a]',
    icon: 'border-[#714a58] bg-[#39272f] text-[#efa0b8]',
    dot: 'bg-[#ef93ae]',
    ring: 'ring-[#ef93ae]/20',
  },
  coral: {
    card: 'border-[#5a423f] bg-[#2a2423]',
    selected: 'border-[#a35f59] bg-[#312523]',
    icon: 'border-[#704b47] bg-[#3a2927] text-[#eda296]',
    dot: 'bg-[#ef8d80]',
    ring: 'ring-[#ef8d80]/20',
  },
  amber: {
    card: 'border-[#564735] bg-[#2a2722]',
    selected: 'border-[#9a7848] bg-[#30291f]',
    icon: 'border-[#635139] bg-[#382f23] text-[#e5ba7e]',
    dot: 'bg-[#e5bb7a]',
    ring: 'ring-[#e5bb7a]/20',
  },
  emerald: {
    card: 'border-[#344d43] bg-[#222a27]',
    selected: 'border-[#417762] bg-[#20322b]',
    icon: 'border-[#365c4e] bg-[#223a31] text-[#7cd7b2]',
    dot: 'bg-[#6dd5a9]',
    ring: 'ring-[#6dd5a9]/20',
  },
}

function getDatasetLabel(selections) {
  const folders = new Set()
  SLOTS.forEach((slot) => {
    selections[slot.key]?.entries?.forEach((entry) => {
      const dirs = String(entry.path || entry.file?.name || '')
        .split('/')
        .slice(0, -1)
      const folder = dirs[dirs.length - 1]
      if (folder) folders.add(folder)
    })
  })
  const unique = [...folders]
  return unique.length === 1 ? unique[0] : 'HE / IHC 配对切片'
}

function isManualPair(selections) {
  const imageCounts = [
    selections.heImages.entries.length,
    selections.ihcImages.entries.length,
  ]
  const annotationCounts = [
    selections.heGeojson.entries.length,
    selections.ihcGeojson.entries.length,
  ]
  return (
    imageCounts.every((count) => count === 1) &&
    annotationCounts.every((count) => count <= 1)
  )
}

function slotAccepts(slot, file) {
  if (slot.extension === 'geojson') return getExtension(file.name) === 'geojson'
  return getExtension(file.name) === 'tif'
}

export default function ImportSourcesDialog({
  onClose,
  onImport,
  onSingleFolder,
}) {
  const [selections, setSelections] = useState(
    () =>
      Object.fromEntries(SLOTS.map((slot) => [slot.key, { ...EMPTY_SELECTION }])),
  )
  const [dragTarget, setDragTarget] = useState(null)
  const [autoDropBusy, setAutoDropBusy] = useState(false)
  const [dropNotice, setDropNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const folderInputRefs = useRef({})
  const fileInputRefs = useRef({})

  const totalSelectableFiles = useMemo(
    () =>
      SLOTS.reduce(
        (sum, slot) => sum + (selections[slot.key]?.entries.length || 0),
        0,
      ),
    [selections],
  )
  const manualPair = isManualPair(selections)
  const canSubmit =
    !submitting &&
    !autoDropBusy &&
    selections.heImages.entries.length > 0 &&
    selections.ihcImages.entries.length > 0

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const applyEntries = (slot, entries, sourceKind, error = '') => {
    const accepted = entries.filter((entry) => slotAccepts(slot, entry.file))
    setSelections((current) => ({
      ...current,
      [slot.key]: accepted.length
        ? { entries: accepted, sourceKind, error: '' }
        : {
            ...EMPTY_SELECTION,
            error:
              error ||
              (slot.role === FILE_ROLE.GEOJSON
                ? '没有找到 .geojson 文件'
                : '没有找到 .tif / .tiff 文件'),
          },
    }))
  }

  const handleInput = (slot, sourceKind, event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    const entries = files.map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    }))
    applyEntries(slot, entries, sourceKind)
  }

  const openFolderPicker = (slot) => {
    setDropNotice('')
    const input = folderInputRefs.current[slot.key]
    if (!input) return
    input.value = ''
    input.click()
  }

  const openFilePicker = (slot) => {
    setDropNotice('')
    const input = fileInputRefs.current[slot.key]
    if (!input) return
    input.value = ''
    input.click()
  }

  const handleSlotDrop = async (slot, event) => {
    event.preventDefault()
    event.stopPropagation()
    setDragTarget(null)
    setDropNotice('')
    try {
      const entries = await collectDroppedEntries(event.dataTransfer)
      applyEntries(slot, entries, 'drop')
    } catch (error) {
      applyEntries(
        slot,
        [],
        'drop',
        error instanceof Error ? error.message : '无法读取拖入的内容',
      )
    }
  }

  const handleAutoDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setDragTarget(null)
    setAutoDropBusy(true)
    setDropNotice('')
    try {
      const entries = await collectDroppedEntries(event.dataTransfer)
      const { slots, unclassified } = splitEntriesByRole(entries)
      const assigned = SLOTS.reduce(
        (sum, slot) => sum + (slots[slot.key]?.length || 0),
        0,
      )
      setSelections((current) => {
        const next = { ...current }
        SLOTS.forEach((slot) => {
          const matched = slots[slot.key] || []
          if (!matched.length) return
          next[slot.key] = {
            entries: matched,
            sourceKind: 'drop',
            error: '',
          }
        })
        return next
      })
      setDropNotice(
        assigned
          ? `已自动归类 ${assigned} 个文件${
              unclassified.length
                ? `，另有 ${unclassified.length} 个文件未能识别，请手动分配到对应卡片。`
                : '。'
            }`
          : unclassified.length
            ? `拖入了 ${unclassified.length} 个文件，但未能识别 HE / IHC 角色，请拖到对应卡片或使用选择按钮。`
            : '没有找到可导入的 TIFF / GeoJSON 文件。',
      )
    } catch (error) {
      setDropNotice(
        error instanceof Error ? error.message : '无法读取拖入的内容',
      )
    } finally {
      setAutoDropBusy(false)
    }
  }

  const clearSlot = (slot) => {
    setSelections((current) => ({
      ...current,
      [slot.key]: { ...EMPTY_SELECTION },
    }))
  }

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    const entries = []
    SLOTS.forEach((slot) => {
      const selection = selections[slot.key]
      selection.entries.forEach((entry) => {
        entries.push({
          file: entry.file,
          role: slot.role,
          annotationSide: slot.annotationSide || null,
          path: `${slot.prefix}/${entry.path}`,
        })
      })
    })
    onImport(entries, getDatasetLabel(selections), { manual: manualPair })
  }

  return (
    <div
      className="fixed inset-0 z-[9200] flex items-center justify-center bg-[#101215]/72 p-4 backdrop-blur-[3px] sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-import-title"
    >
      <div className="flex max-h-[calc(100vh-32px)] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[#3c4553] bg-[#24262a] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
        <header className="relative flex shrink-0 items-start justify-between gap-4 border-b border-[#373d46] bg-[linear-gradient(145deg,#2c3036,#25272b)] px-5 py-4">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5c7db3]/50 to-transparent" />
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#47649b]/60 bg-[#293a58]/70 text-[#96b8f7]">
              <Link2 className="h-5 w-5" strokeWidth={1.7} />
            </div>
            <div>
              <h2
                id="source-import-title"
                className="text-[14px] font-medium text-[#e4e9f0]"
              >
                导入 HE / IHC 切片
              </h2>
              <p className="mt-1 text-[10px] leading-4 text-[#8993a1]">
                选择四个目录或四个单文件，也可以直接拖入。目录模式自动按文件名配对，单文件模式作为一组手动配对。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8b949f] transition-colors hover:bg-white/[0.06] hover:text-[#d8e0e9]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragTarget('auto')
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={handleAutoDrop}
            className={`mb-3 flex min-h-[50px] items-center gap-3 rounded-lg border border-dashed px-3 transition-colors ${
              dragTarget === 'auto'
                ? 'border-[#5f83c7] bg-[#2a3548]/80'
                : 'border-[#3e4959] bg-[#22262c]'
            }`}
          >
            {autoDropBusy ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#8cb4f6]" />
            ) : (
              <UploadCloud className="h-5 w-5 shrink-0 text-[#7898c8]" strokeWidth={1.7} />
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-[#b9c9de]">
                将四个文件夹或文件拖到这里，自动识别角色
              </div>
              <div className="mt-0.5 text-[8.5px] leading-4 text-[#697687]">
                也可以拖到下方对应卡片，或分别点击文件夹 / 单文件按钮选择。
              </div>
            </div>
          </div>

          {dropNotice && (
            <div className="mb-3 flex items-start gap-1.5 rounded-md border border-[#40536e]/70 bg-[#252e3a] px-3 py-2 text-[9px] leading-4 text-[#a3b5cc]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[#7fa4d8]" />
              {dropNotice}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#737f8e]">
              数据源
            </span>
            <span className="font-mono text-[8px] text-[#5f6874]">
              TIFF / BIGTIFF · GEOJSON
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {SLOTS.map((slot) => {
              const selection = selections[slot.key]
              const tone = TONE[slot.tone] || TONE.rose
              const Icon = slot.icon
              const selected = selection.entries.length > 0
              const label = getSelectionLabel(selection.entries)
              const highlighted = dragTarget === slot.key
              return (
                <div
                  key={slot.key}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setDragTarget(slot.key)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setDragTarget((current) =>
                        current === slot.key ? null : current,
                      )
                    }
                  }}
                  onDrop={(event) => handleSlotDrop(slot, event)}
                  className={`relative rounded-lg border p-3 transition-colors ${
                    highlighted
                      ? 'border-[#719be3] bg-[#293447] ring-1 ring-[#719be3]/25'
                      : selected
                        ? tone.selected
                        : tone.card
                  }`}
                >
                  <input
                    ref={(node) => {
                      folderInputRefs.current[slot.key] = node
                    }}
                    type="file"
                    multiple
                    webkitdirectory=""
                    directory=""
                    accept={slot.extension === 'geojson' ? '.geojson' : '.tif,.tiff'}
                    className="hidden"
                    tabIndex={-1}
                    onChange={(event) => handleInput(slot, 'folder', event)}
                  />
                  <input
                    ref={(node) => {
                      fileInputRefs.current[slot.key] = node
                    }}
                    type="file"
                    accept={slot.extension === 'geojson' ? '.geojson' : '.tif,.tiff'}
                    className="hidden"
                    tabIndex={-1}
                    onChange={(event) => handleInput(slot, 'file', event)}
                  />

                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${tone.icon}`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.65} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[11px] font-medium text-[#dce2e9]">
                          {slot.title}
                        </h3>
                        <span
                          className={`rounded px-1 py-[1px] font-mono text-[7px] uppercase tracking-[0.04em] ${
                            slot.required
                              ? 'bg-white/[0.06] text-[#8e99a8]'
                              : 'bg-white/[0.035] text-[#687483]'
                          }`}
                        >
                          {slot.required ? '必需' : '可选'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[8.5px] text-[#747f8d]">
                        {slot.description}
                      </p>
                    </div>
                    {selected && (
                      <button
                        type="button"
                        onClick={() => clearSlot(slot)}
                        className="text-[8px] text-[#6f7a87] transition-colors hover:text-[#c3cdd8]"
                      >
                        清除
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openFolderPicker(slot)}
                      className="flex h-7 items-center gap-1.5 rounded border border-[#47515e] bg-[#2a2e34] px-2 text-[9px] text-[#b3bdc9] transition-colors hover:border-[#5c708c] hover:text-[#e1e9f2]"
                    >
                      <FolderOpen className="h-3 w-3" strokeWidth={1.7} />
                      文件夹
                    </button>
                    <button
                      type="button"
                      onClick={() => openFilePicker(slot)}
                      className="flex h-7 items-center gap-1.5 rounded border border-[#47515e] bg-[#2a2e34] px-2 text-[9px] text-[#b3bdc9] transition-colors hover:border-[#5c708c] hover:text-[#e1e9f2]"
                    >
                      <FileIcon className="h-3 w-3" strokeWidth={1.7} />
                      单文件
                    </button>
                    <span className="ml-auto font-mono text-[7.5px] uppercase tracking-[0.04em] text-[#5d6977]">
                      拖入亦可
                    </span>
                  </div>

                  <div className="mt-2 min-h-[20px]">
                    {selected ? (
                      <div className="flex items-center gap-1.5 text-[8.5px] text-[#9eabb9]">
                        <Check className="h-3 w-3 shrink-0 text-[#68d1a8]" />
                        <span className="truncate" title={label}>
                          {label || '已选择'}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[8px] text-[#748292]">
                          {selection.entries.length} 文件
                        </span>
                      </div>
                    ) : selection.error ? (
                      <span className="flex items-center gap-1 text-[8.5px] text-[#c89661]">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {selection.error}
                      </span>
                    ) : (
                      <span className="text-[8.5px] text-[#5f6873]">
                        尚未选择{slot.required ? '，必填' : '，可留空'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[#343c47] bg-[#22262b] px-3 py-2 text-[8.5px] leading-4 text-[#6f7b89]">
            <span>
              <span className="text-[#8d9aab]">匹配方式：</span>
              {manualPair
                ? '当前为四个单切片手动配对'
                : totalSelectableFiles > 0
                  ? '将按文件名和切片坐标自动匹配'
                  : '选择数据后自动判断'}
            </span>
            <span className="shrink-0 font-mono text-[8px] text-[#596474]">
              {totalSelectableFiles} 文件
            </span>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#373d46] bg-[#222428] px-5 py-3">
          <button
            type="button"
            onClick={onSingleFolder}
            className="text-[9px] text-[#7f96ba] transition-colors hover:text-[#b8cff3]"
          >
            快速选择单个上级目录自动识别
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-[#3e434b] bg-[#292b2f] px-3 text-[10px] text-[#aeb6c1] transition-colors hover:border-[#525a65] hover:text-[#dce3ec]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-[10px] font-medium transition-all ${
                canSubmit
                  ? 'border-[#739cff]/30 bg-[#4f7df3] text-white shadow-[0_4px_16px_rgba(56,100,220,0.24)] hover:bg-[#5d89f7]'
                  : 'cursor-not-allowed border-[#42464e] bg-[#303237] text-[#707680]'
              }`}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
              {manualPair ? '导入手动配对' : '开始导入'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
