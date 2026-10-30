import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  FolderOpen,
  FolderPlus,
  Keyboard,
  Loader2,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { FILE_ROLE } from '../utils/grouping'

const ROLE_META = {
  [FILE_ROLE.HE]: {
    label: 'HE',
    badgeClass: 'border-rose-300/15 bg-rose-300/10 text-rose-200',
    dotClass: 'bg-rose-300',
  },
  [FILE_ROLE.IHC]: {
    label: 'IHC',
    badgeClass: 'border-amber-300/15 bg-amber-300/10 text-amber-200',
    dotClass: 'bg-amber-300',
  },
  [FILE_ROLE.GEOJSON]: {
    label: 'GEO',
    badgeClass: 'border-emerald-300/15 bg-emerald-300/10 text-emerald-200',
    dotClass: 'bg-emerald-300',
  },
  [FILE_ROLE.UNKNOWN]: {
    label: 'FILE',
    badgeClass: 'border-stone-300/15 bg-stone-300/10 text-stone-300',
    dotClass: 'bg-stone-400',
  },
}

function RoleBadge({ role, compact = false }) {
  const meta = ROLE_META[role] || ROLE_META[FILE_ROLE.UNKNOWN]
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded border font-mono font-medium leading-none ${meta.badgeClass} ${
        compact ? 'h-[15px] px-1 text-[8px]' : 'h-[18px] px-1.5 text-[8.5px]'
      }`}
    >
      {meta.label}
    </span>
  )
}

function rolePresent(group, role) {
  if (role === FILE_ROLE.HE) return Boolean(group.he)
  if (role === FILE_ROLE.IHC) return Boolean(group.ihc)
  if (role === FILE_ROLE.GEOJSON) return Boolean(group.geojson)
  return false
}

function FileRow({ file, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={file.path || file.name}
      className="group/file flex w-full items-center gap-2 rounded-[5px] py-[5px] pl-1 pr-1.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <RoleBadge role={file.role} compact />
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#aeb4be] group-hover/file:text-[#d9dee6]">
        {file.name}
      </span>
      {file.error ? (
        <span title={file.error}>
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" />
        </span>
      ) : (
        <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[#5e6570]">
          {file.role === FILE_ROLE.GEOJSON
            ? file.annotationSide === FILE_ROLE.IHC
              ? 'ihc'
              : file.annotationSide === FILE_ROLE.HE
                ? 'he'
                : 'json'
            : 'tif'}
        </span>
      )}
    </button>
  )
}

function GroupRow({
  group,
  selected,
  expanded,
  onSelect,
  onToggle,
  searchActive,
}) {
  const isComplete = Boolean(group.he && group.ihc)
  const showChildren = searchActive || expanded

  return (
    <div
      className={`group/case relative overflow-hidden rounded-md border transition-all ${
        selected
          ? 'border-[#3d65b4]/60 bg-[linear-gradient(90deg,rgba(58,98,191,0.22),rgba(55,72,105,0.08))] shadow-[inset_2px_0_0_#6195ff]'
          : 'border-transparent hover:border-white/[0.035] hover:bg-white/[0.028]'
      }`}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-7 shrink-0 items-center justify-center rounded-l-md text-[#707884] transition-colors hover:text-[#c5d0df]"
          aria-label={showChildren ? `收起 ${group.label}` : `展开 ${group.label}`}
          title={showChildren ? '收起文件' : '展开文件'}
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-150 ${showChildren ? 'rotate-90' : ''}`}
            strokeWidth={2}
          />
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 py-[7px] pr-2 text-left"
          title={[group.fullLabel || group.label, group.folderPath]
            .filter(Boolean)
            .join('\n')}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {selected ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#82aaff]" strokeWidth={1.7} />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-[#7e8795]" strokeWidth={1.7} />
            )}
            <span
              className={`min-w-0 flex-1 truncate text-[12px] ${
                selected ? 'font-medium text-[#e6ecf6]' : 'text-[#c1c6ce]'
              }`}
            >
              {group.label}
            </span>
            {!isComplete && (
              <span title={!group.he ? '缺少 HE 切片' : '缺少 IHC 切片'}>
                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500/80" />
              </span>
            )}
            <span className="font-mono text-[9px] text-[#656d79]">
              {group.fileCount}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1 pl-[20px]">
            {[FILE_ROLE.HE, FILE_ROLE.IHC, FILE_ROLE.GEOJSON].map((role) => {
              const active = rolePresent(group, role)
              const meta = ROLE_META[role]
              const geoCount = new Set(
                [group.heGeojson, group.ihcGeojson, group.geojson]
                  .filter(Boolean)
                  .map((file) => file.id),
              ).size
              const label =
                role === FILE_ROLE.GEOJSON && geoCount > 1
                  ? `${meta.label}×${geoCount}`
                  : meta.label
              return (
                <span
                  key={role}
                  title={`${meta.label} ${active ? '已匹配' : '缺失'}`}
                  className={`inline-flex h-[14px] items-center gap-1 rounded-[3px] border px-1 font-mono text-[7.5px] ${
                    active
                      ? meta.badgeClass
                      : 'border-white/[0.045] bg-transparent text-[#565d68]'
                  }`}
                >
                  <span
                    className={`h-[3px] w-[3px] rounded-full ${
                      active ? meta.dotClass : 'bg-[#505761]'
                    }`}
                  />
                  {label}
                </span>
              )
            })}
            {(group.geojson || group.isManual) && (
              <span
                className="ml-auto rounded bg-[#172b24]/60 px-1 py-[1px] font-mono text-[7px] uppercase tracking-wider text-[#6fd4aa]/80"
                title={
                  group.isManual
                    ? '该组由四个文件手动配对'
                    : '标注文件已关联，打开切片时按需解析'
                }
              >
                {group.isManual ? 'manual' : 'linked'}
              </span>
            )}
          </div>
        </button>
      </div>

      {showChildren && (
        <div className="ml-[23px] border-l border-white/[0.075] pb-1.5 pl-2 pr-2">
          {group.files.map((file) => (
            <FileRow key={file.id} file={file} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

function Sidebar({
  dataset,
  selectedGroupId,
  selectedGroup,
  onSelectGroup,
  onImport,
  onRestoreDemo,
  isImporting,
}) {
  const [query, setQuery] = useState('')
  const [rootOpen, setRootOpen] = useState(true)
  const [unmatchedOpen, setUnmatchedOpen] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(selectedGroupId ? [selectedGroupId] : []),
  )
  const previousDatasetName = useRef(dataset.name)

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (selectedGroupId) next.add(selectedGroupId)
      return next
    })
  }, [selectedGroupId])

  useEffect(() => {
    if (previousDatasetName.current !== dataset.name) {
      previousDatasetName.current = dataset.name
      setRootOpen(true)
      setExpandedGroups(new Set(selectedGroupId ? [selectedGroupId] : []))
    }
  }, [dataset.name, selectedGroupId])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return dataset.groups
    return dataset.groups.filter((group) => {
      const haystack = [
        group.label,
        group.folderPath,
        group.he?.name,
        group.ihc?.name,
        group.heGeojson?.name,
        group.ihcGeojson?.name,
        group.geojson?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [dataset.groups, normalizedQuery])

  const toggleGroup = (id) => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectGroup = (id) => {
    onSelectGroup(id)
    setExpandedGroups((current) => new Set(current).add(id))
  }

  const sourceIsDemo = dataset.source === 'demo'
  const groupCount = dataset.groups.length

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#354257] bg-[#252629]">
      <div className="border-b border-[#354257] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#7d8591]">
            <Database className="h-3.5 w-3.5 text-[#6f8fcb]" strokeWidth={1.8} />
            数据目录
          </div>
          <div className="flex items-center gap-1.5">
            {sourceIsDemo ? (
              <span className="inline-flex h-5 items-center gap-1 rounded border border-[#3f5683]/60 bg-[#2b3851]/60 px-1.5 text-[8px] uppercase tracking-[0.08em] text-[#91b5ff]">
                <Sparkles className="h-2.5 w-2.5" />
                demo
              </span>
            ) : (
              <span className="inline-flex h-5 items-center rounded border border-white/[0.07] bg-white/[0.035] px-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#89919d]">
                local
              </span>
            )}
            <button
              type="button"
              onClick={onImport}
              disabled={isImporting}
              className="flex h-6 w-6 items-center justify-center rounded border border-[#3f444d] bg-[#2c2e33] text-[#8e97a4] transition-colors hover:border-[#536581] hover:bg-[#343942] hover:text-[#c0d4f8] disabled:cursor-wait disabled:opacity-50"
              title="导入文件夹"
              aria-label="导入文件夹"
            >
              {isImporting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FolderPlus className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <h1
            className="min-w-0 truncate text-[13px] font-medium tracking-[0.01em] text-[#e0e4ea]"
            title={dataset.name}
          >
            {dataset.name}
          </h1>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[9.5px] text-[#747c87]">
          <span>{groupCount} 个切片组</span>
          <span className="h-2.5 w-px bg-[#3e4148]" />
          <span>{dataset.stats.total} 个文件</span>
          <span className="h-2.5 w-px bg-[#3e4148]" />
          <span className="text-[#6e90a8]">切片身份匹配</span>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#69717d]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索切片组、文件名或目录"
            className="h-8 w-full rounded-md border border-[#3d4149] bg-[#1f2023] pl-8 pr-7 text-[10.5px] text-[#ccd1d9] placeholder:text-[#626a75] transition-colors focus:border-[#476aa8] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-[#7e8692] hover:bg-white/[0.06] hover:text-[#d0d6df]"
              aria-label="清除搜索"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#303a48] bg-[#232528] px-3">
          <span className="text-[9px] font-medium uppercase tracking-[0.13em] text-[#737b87]">
            切片目录
          </span>
          {normalizedQuery ? (
            <span className="font-mono text-[8.5px] text-[#74829a]">
              {filteredGroups.length} / {groupCount} 匹配
            </span>
          ) : (
            <span className="font-mono text-[8.5px] text-[#5f6873]">/ 自动分组</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
          <button
            type="button"
            onClick={() => setRootOpen((current) => !current)}
            className="flex h-7 w-full items-center gap-1.5 rounded px-1 text-left text-[10.5px] text-[#929aa5] transition-colors hover:bg-white/[0.028]"
          >
            <ChevronDown
              className={`h-3 w-3 text-[#707884] transition-transform ${
                rootOpen || normalizedQuery ? '' : '-rotate-90'
              }`}
            />
            <FolderOpen className="h-3.5 w-3.5 text-[#6e8cc2]" strokeWidth={1.8} />
            <span className="flex-1 truncate">自动匹配切片组</span>
            <span className="rounded bg-white/[0.045] px-1.5 py-0.5 font-mono text-[8px] text-[#7f8792]">
              {groupCount}
            </span>
          </button>

          {(rootOpen || normalizedQuery) && (
            <div className="relative mt-1 space-y-0.5 pl-[13px]">
              <div className="pointer-events-none absolute bottom-2 left-[6px] top-1 border-l border-[#393d44]" />
              {filteredGroups.length > 0 ? (
                filteredGroups.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    selected={selectedGroupId === group.id}
                    expanded={expandedGroups.has(group.id)}
                    onSelect={() => selectGroup(group.id)}
                    onToggle={() => toggleGroup(group.id)}
                    searchActive={Boolean(normalizedQuery)}
                  />
                ))
              ) : (
                <div className="mx-2 my-3 rounded-md border border-dashed border-[#3a3e46] px-3 py-4 text-center">
                  <Search className="mx-auto h-4 w-4 text-[#5c636e]" />
                  <p className="mt-2 text-[10px] text-[#7e8692]">
                    {groupCount ? '没有匹配的切片组' : '尚未形成切片组'}
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-[#626a75]">
                    {groupCount
                      ? '尝试切片编号、文件名或目录名'
                      : '导入包含 HE / IHC 与 GeoJSON 的文件夹'}
                  </p>
                </div>
              )}
            </div>
          )}

          {dataset.unmatched.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setUnmatchedOpen((current) => !current)}
                className="flex h-7 w-full items-center gap-1.5 rounded px-1 text-left text-[10.5px] text-[#938b79] transition-colors hover:bg-white/[0.028]"
              >
                <ChevronDown
                  className={`h-3 w-3 text-[#706b5f] transition-transform ${
                    unmatchedOpen ? '' : '-rotate-90'
                  }`}
                />
                <AlertTriangle className="h-3.5 w-3.5 text-[#b7955c]" strokeWidth={1.7} />
                <span className="flex-1 truncate">未分组文件</span>
                <span className="rounded bg-[#3c3324]/55 px-1.5 py-0.5 font-mono text-[8px] text-[#b99e76]">
                  {dataset.unmatched.length}
                </span>
              </button>
              {unmatchedOpen && (
                <div className="mt-1 space-y-[1px] pl-[26px] pr-1">
                  {dataset.unmatched.map((file) => {
                    const meta = ROLE_META[file.role] || ROLE_META[FILE_ROLE.UNKNOWN]
                    return (
                      <div
                        key={file.id}
                        className="flex min-w-0 items-center gap-1.5 rounded py-[4px] text-[#7e8590]"
                        title={file.error || file.path}
                      >
                        <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${meta.dotClass}`} />
                        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px]">
                          {file.name}
                        </span>
                        {file.error && <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />}
                      </div>
                    )
                  })}
                  <p className="pt-1.5 text-[8.5px] leading-4 text-[#666e79]">
                    文件名中未识别到 HE / IHC，或未匹配到对应切片组。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#354257] p-3">
        <div className="rounded-lg border border-[#344966] bg-[linear-gradient(145deg,rgba(36,51,74,0.62),rgba(36,38,43,0.72))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#aebed6]">
              <Keyboard className="h-3.5 w-3.5 text-[#81a5e1]" strokeWidth={1.7} />
              像素级微调
            </div>
            <span className="font-mono text-[8.5px] text-[#6f90bd]">
              {selectedGroup?.ihc ? 'IHC · 1 PX' : 'NO IHC'}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="keycap">←</span>
            <span className="keycap">↑</span>
            <span className="keycap">↓</span>
            <span className="keycap">→</span>
            <span className="ml-1 text-[9px] text-[#7e8ea5]">
              每次平移 1 px
            </span>
          </div>
          <p className="mt-2 text-[8.5px] leading-4 text-[#687384]">
            方向键移动当前选中的 IHC 图像或 IHC 标测；HE 标测作为对照保持原位。
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between text-[8.5px] text-[#656d78]">
          <span className="font-mono">LOCAL-FIRST · CRS.Simple</span>
          {sourceIsDemo ? (
            <span className="text-[#708098]">内置演示</span>
          ) : (
            <button
              type="button"
              onClick={onRestoreDemo}
              className="text-[#7f9cc7] transition-colors hover:text-[#adc8ef]"
            >
              载入示例
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between font-mono text-[8px] text-[#4e5660]">
          <span>PathoAlign v1.0</span>
          <span>2 VIEWS</span>
        </div>
      </div>
    </aside>
  )
}

export default memo(Sidebar)
