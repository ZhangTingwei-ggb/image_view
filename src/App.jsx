import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import CaseStrip from './components/CaseStrip'
import SliceViewer from './components/SliceViewer'
import ToastViewport from './components/ToastViewport'
import ImportOverlay from './components/ImportOverlay'
import ImportSourcesDialog from './components/ImportSourcesDialog'
import WorkspaceEmpty from './components/WorkspaceEmpty'
import { createDemoDataset } from './data/demo'
import { FILE_ROLE, groupFiles } from './utils/grouping'
import {
  decodeTiffFile,
  getDatasetFolderName,
  parseGeoJSONFile,
  prepareFiles,
} from './utils/files'
import {
  downloadGeoJSON,
  getRegisteredFileName,
} from './utils/geojson'
import {
  collectDroppedEntries,
  splitEntriesByRole,
} from './utils/importSources'

const EMPTY_OFFSET = Object.freeze({ x: 0, y: 0 })
const NOOP = () => {}

const DROP_ROLE_CONFIG = {
  heImages: { role: FILE_ROLE.HE, prefix: 'he', annotationSide: null },
  heGeojson: {
    role: FILE_ROLE.GEOJSON,
    prefix: 'he_geo',
    annotationSide: FILE_ROLE.HE,
  },
  ihcImages: { role: FILE_ROLE.IHC, prefix: 'ihc', annotationSide: null },
  ihcGeojson: {
    role: FILE_ROLE.GEOJSON,
    prefix: 'ihc_geo',
    annotationSide: FILE_ROLE.IHC,
  },
}

function createDefaultLayerVisibility() {
  return {
    he: { he: true, ihc: true },
    ihc: { he: false, ihc: true },
  }
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value}`
}

function resolveImageFile(file, cache) {
  if (!file) return null
  if (file.error || file.image?.url) return file
  const entry = cache[file.id]
  if (entry?.status === 'ready') {
    return { ...file, image: entry.image, error: null, loading: false }
  }
  if (entry?.status === 'error') {
    return { ...file, image: null, error: entry.error, loading: false }
  }
  return { ...file, loading: true }
}

function resolveGeojsonFile(file, cache) {
  if (!file) return null
  if (file.error || file.geojson) return file
  const entry = cache[file.id]
  if (entry?.status === 'ready') {
    return { ...file, geojson: entry.data, error: null, loading: false }
  }
  if (entry?.status === 'error') {
    return { ...file, geojson: null, error: entry.error, loading: false }
  }
  return { ...file, loading: true }
}

export default function App() {
  const initialDatasetRef = useRef()
  if (!initialDatasetRef.current) {
    initialDatasetRef.current = createDemoDataset()
  }

  const [dataset, setDataset] = useState(initialDatasetRef.current)
  const [selectedGroupId, setSelectedGroupId] = useState(
    () => initialDatasetRef.current.groups[0]?.id || null,
  )
  const [annotationOffsets, setAnnotationOffsets] = useState({})
  const [imageOffsets, setImageOffsets] = useState({})
  const [alignTarget, setAlignTarget] = useState('image')
  const [layerVisibility, setLayerVisibility] = useState(
    createDefaultLayerVisibility,
  )
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [fitNonce, setFitNonce] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [toasts, setToasts] = useState([])
  const [anchorMode, setAnchorMode] = useState(false)
  const [anchorPair, setAnchorPair] = useState(null)
  const [imageCache, setImageCache] = useState({})
  const [geojsonCache, setGeojsonCache] = useState({})

  const fileInputRef = useRef(null)
  const objectUrlsRef = useRef(new Set())
  const toastTimersRef = useRef(new Map())
  const toastCounterRef = useRef(0)
  const imageCacheRef = useRef({})
  const geojsonCacheRef = useRef({})
  const datasetEpochRef = useRef(0)

  const mapRegistryRef = useRef({ he: null, ihc: null })
  const syncEnabledRef = useRef(syncEnabled)
  const syncApplyingRef = useRef(false)
  const lastActiveSideRef = useRef('he')

  const selectedGroup = useMemo(
    () => dataset.groups.find((group) => group.id === selectedGroupId) || null,
    [dataset.groups, selectedGroupId],
  )

  const annotationOffset = useMemo(
    () => annotationOffsets[selectedGroupId] || EMPTY_OFFSET,
    [annotationOffsets, selectedGroupId],
  )

  const imageOffset = useMemo(
    () => imageOffsets[selectedGroupId] || EMPTY_OFFSET,
    [imageOffsets, selectedGroupId],
  )

  const resolvedHeFile = useMemo(
    () => resolveImageFile(selectedGroup?.he, imageCache),
    [selectedGroup, imageCache],
  )
  const resolvedIhcFile = useMemo(
    () => resolveImageFile(selectedGroup?.ihc, imageCache),
    [selectedGroup, imageCache],
  )
  const ihcAnnotationDescriptor = useMemo(() => {
    if (!selectedGroup) return null
    if (selectedGroup.ihcGeojson) return selectedGroup.ihcGeojson
    // An unlabelled single annotation retains the original behaviour of
    // being displayed on the IHC panel.
    if (selectedGroup.geojson?.annotationSide !== 'he') {
      return selectedGroup.geojson
    }
    return null
  }, [selectedGroup])

  const resolvedIhcAnnotationFile = useMemo(
    () => resolveGeojsonFile(ihcAnnotationDescriptor, geojsonCache),
    [ihcAnnotationDescriptor, geojsonCache],
  )
  const resolvedHeAnnotationFile = useMemo(
    () => resolveGeojsonFile(selectedGroup?.heGeojson, geojsonCache),
    [selectedGroup, geojsonCache],
  )

  const currentGeojsonData = resolvedIhcAnnotationFile?.geojson || null
  const annotationLoading = Boolean(resolvedIhcAnnotationFile?.loading)
  const annotationError = resolvedIhcAnnotationFile?.error || null
  const effectiveAlignTarget =
    alignTarget === 'annotation' && ihcAnnotationDescriptor
      ? 'annotation'
      : 'image'
  const activeOffset =
    effectiveAlignTarget === 'annotation' ? annotationOffset : imageOffset
  const canExport = Boolean(currentGeojsonData)
  const registeredFileName = useMemo(
    () =>
      ihcAnnotationDescriptor?.name
        ? getRegisteredFileName(ihcAnnotationDescriptor.name)
        : '',
    [ihcAnnotationDescriptor],
  )

  const heViewAnnotations = useMemo(
    () => [
      {
        key: 'he',
        file: resolvedHeAnnotationFile,
        visible: layerVisibility.he.he,
      },
      {
        key: 'ihc',
        file: resolvedIhcAnnotationFile,
        visible: layerVisibility.he.ihc,
      },
    ],
    [
      resolvedHeAnnotationFile,
      resolvedIhcAnnotationFile,
      layerVisibility.he.he,
      layerVisibility.he.ihc,
    ],
  )

  const ihcViewAnnotations = useMemo(
    () => [
      {
        key: 'he',
        file: resolvedHeAnnotationFile,
        visible: layerVisibility.ihc.he,
      },
      {
        key: 'ihc',
        file: resolvedIhcAnnotationFile,
        visible: layerVisibility.ihc.ihc,
      },
    ],
    [
      resolvedHeAnnotationFile,
      resolvedIhcAnnotationFile,
      layerVisibility.ihc.he,
      layerVisibility.ihc.ihc,
    ],
  )

  const annotationLayerOffsets = useMemo(
    () => ({
      he: EMPTY_OFFSET,
      ihc: annotationOffset,
    }),
    [annotationOffset],
  )

  const handleToggleHeViewLayer = useCallback((layerKey) => {
    setLayerVisibility((current) => ({
      ...current,
      he: { ...current.he, [layerKey]: !current.he[layerKey] },
    }))
  }, [])

  const handleToggleIhcViewLayer = useCallback((layerKey) => {
    setLayerVisibility((current) => ({
      ...current,
      ihc: { ...current.ihc, [layerKey]: !current.ihc[layerKey] },
    }))
  }, [])

  const applyViewToSibling = useCallback((sourceSide, center, zoom) => {
    if (syncApplyingRef.current) return

    const targetSide = sourceSide === 'he' ? 'ihc' : 'he'
    const targetMap = mapRegistryRef.current[targetSide]
    if (!targetMap) return

    if (targetMap._animatingZoom) return

    const targetCenter = targetMap.getCenter()
    const sameCenter =
      Math.abs(targetCenter.lat - center.lat) < 0.05 &&
      Math.abs(targetCenter.lng - center.lng) < 0.05
    const sameZoom = Math.abs(targetMap.getZoom() - zoom) < 0.002
    if (sameCenter && sameZoom) return

    // setView(..., { animate:false }) dispatches its move/zoom events
    // synchronously. Guarding this call means the sibling's echo is ignored
    // without delaying real user input by a timeout.
    syncApplyingRef.current = true
    try {
      targetMap.setView([center.lat, center.lng], zoom, { animate: false })
    } finally {
      syncApplyingRef.current = false
    }
  }, [])

  useEffect(() => {
    syncEnabledRef.current = syncEnabled
    if (!syncEnabled) return

    const sourceSide = lastActiveSideRef.current
    const sourceMap =
      mapRegistryRef.current[sourceSide] ||
      mapRegistryRef.current.he ||
      mapRegistryRef.current.ihc
    if (!sourceMap) return
    const actualSourceSide =
      mapRegistryRef.current.he === sourceMap ? 'he' : 'ihc'
    applyViewToSibling(
      actualSourceSide,
      sourceMap.getCenter(),
      sourceMap.getZoom(),
    )
  }, [syncEnabled, applyViewToSibling])

  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    toastTimersRef.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (title, type = 'info', message = '') => {
      const id = ++toastCounterRef.current
      setToasts((current) => [...current.slice(-3), { id, title, type, message }])
      const timer = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
        toastTimersRef.current.delete(id)
      }, 5200)
      toastTimersRef.current.set(id, timer)
    },
    [],
  )

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      toastTimersRef.current.clear()
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrlsRef.current.clear()
    }
  }, [])

  const ensureImageLoaded = useCallback((file) => {
    if (!file?.file || file.image?.url) return
    if (imageCacheRef.current[file.id]) return

    const epoch = datasetEpochRef.current
    const loadingEntry = { status: 'loading' }
    imageCacheRef.current = {
      ...imageCacheRef.current,
      [file.id]: loadingEntry,
    }
    setImageCache(imageCacheRef.current)

    decodeTiffFile(file.file)
      .then((image) => {
        if (epoch !== datasetEpochRef.current) {
          URL.revokeObjectURL(image.url)
          return
        }
        objectUrlsRef.current.add(image.url)
        imageCacheRef.current = {
          ...imageCacheRef.current,
          [file.id]: { status: 'ready', image },
        }
        setImageCache(imageCacheRef.current)
      })
      .catch((error) => {
        if (epoch !== datasetEpochRef.current) return
        imageCacheRef.current = {
          ...imageCacheRef.current,
          [file.id]: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
        setImageCache(imageCacheRef.current)
      })
  }, [])

  const ensureGeojsonLoaded = useCallback((file) => {
    if (!file?.file || file.geojson) return
    if (geojsonCacheRef.current[file.id]) return

    const epoch = datasetEpochRef.current
    geojsonCacheRef.current = {
      ...geojsonCacheRef.current,
      [file.id]: { status: 'loading' },
    }
    setGeojsonCache(geojsonCacheRef.current)

    parseGeoJSONFile(file.file)
      .then((data) => {
        if (epoch !== datasetEpochRef.current) return
        geojsonCacheRef.current = {
          ...geojsonCacheRef.current,
          [file.id]: { status: 'ready', data },
        }
        setGeojsonCache(geojsonCacheRef.current)
      })
      .catch((error) => {
        if (epoch !== datasetEpochRef.current) return
        geojsonCacheRef.current = {
          ...geojsonCacheRef.current,
          [file.id]: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
        setGeojsonCache(geojsonCacheRef.current)
      })
  }, [])

  useEffect(() => {
    if (!selectedGroup) return
    ensureImageLoaded(selectedGroup.he)
    ensureImageLoaded(selectedGroup.ihc)
    ensureGeojsonLoaded(selectedGroup.heGeojson)
    ensureGeojsonLoaded(ihcAnnotationDescriptor)
  }, [
    selectedGroup,
    ihcAnnotationDescriptor,
    ensureImageLoaded,
    ensureGeojsonLoaded,
  ])

  const handleRegisterMap = useCallback((side, map) => {
    mapRegistryRef.current[side] = map
  }, [])

  const handleMapViewChange = useCallback(
    (sourceSide, center, zoom) => {
      lastActiveSideRef.current = sourceSide
      if (!syncEnabledRef.current) return
      applyViewToSibling(sourceSide, center, zoom)
    },
    [applyViewToSibling],
  )

  const handleMapZoomAnim = useCallback((sourceSide, center, zoom) => {
    if (!syncEnabledRef.current) return
    const targetSide = sourceSide === 'he' ? 'ihc' : 'he'
    const targetMap = mapRegistryRef.current[targetSide]
    if (!targetMap) return
    // A zoomanim from the pane we are already steering indicates the echo of
    // our own programmatic animation, not a new user gesture.
    if (targetMap._animatingZoom) return

    const targetCenter = targetMap.getCenter()
    const sameCenter =
      Math.abs(targetCenter.lat - center.lat) < 0.05 &&
      Math.abs(targetCenter.lng - center.lng) < 0.05
    if (sameCenter && Math.abs(targetMap.getZoom() - zoom) < 0.001) return

    targetMap.setView([center.lat, center.lng], zoom, {
      animate: true,
      duration: 0.25,
    })
  }, [])

  const handleSelectGroup = useCallback(
    (id) => {
      if (id === selectedGroupId) return
      if (!dataset.groups.some((group) => group.id === id)) return
      setAnchorMode(false)
      setAnchorPair(null)
      setSelectedGroupId(id)
      setSidebarOpen(false)
      setFitNonce((value) => value + 1)
    },
    [dataset.groups, selectedGroupId],
  )

  const handleSelectAlignTarget = useCallback((target) => {
    if (target !== 'image' && target !== 'annotation') return
    setAlignTarget(target)
  }, [])

  const handleToggleAnchorMode = useCallback(() => {
    setAnchorMode((current) => !current)
    setAnchorPair(null)
  }, [])

  const handleAnchorPlace = useCallback((side, point) => {
    if (!point) return
    setAnchorPair((current) => {
      if (!current || current.sourceSide === side) {
        return { sourceSide: side, he: point, ihc: point }
      }
      return { ...current, [side]: point }
    })
  }, [])

  const handleAnchorDrag = useCallback((side, point) => {
    if (!point) return
    setAnchorPair((current) => {
      if (!current || current.sourceSide === side) return current
      return { ...current, [side]: point }
    })
  }, [])

  const cancelAnchor = useCallback(() => {
    setAnchorMode(false)
    setAnchorPair(null)
  }, [])

  const finishAnchor = useCallback(() => {
    if (!anchorPair || !selectedGroupId) {
      cancelAnchor()
      return
    }
    const dx = Number((anchorPair.he.x - anchorPair.ihc.x).toFixed(2))
    const dy = Number((anchorPair.he.y - anchorPair.ihc.y).toFixed(2))
    setAnnotationOffsets((current) => ({
      ...current,
      [selectedGroupId]: { x: dx, y: dy },
    }))
    setAlignTarget('annotation')
    setAnchorMode(false)
    setAnchorPair(null)
    pushToast(
      '锚点配准完成',
      'success',
      `IHC 标测已按锚点平移 X ${formatSigned(dx)} / Y ${formatSigned(dy)} px`,
    )
  }, [anchorPair, cancelAnchor, pushToast, selectedGroupId])

  const handleResetOffset = useCallback(() => {
    if (!selectedGroupId) return
    const setter =
      effectiveAlignTarget === 'image' ? setImageOffsets : setAnnotationOffsets
    setter((current) => ({
      ...current,
      [selectedGroupId]: { x: 0, y: 0 },
    }))
  }, [effectiveAlignTarget, selectedGroupId])

  const nudgeOffset = useCallback(
    (deltaX, deltaY) => {
      if (!selectedGroupId) return
      const setter =
        effectiveAlignTarget === 'image' ? setImageOffsets : setAnnotationOffsets
      setter((current) => {
        const existing = current[selectedGroupId] || { x: 0, y: 0 }
        return {
          ...current,
          [selectedGroupId]: {
            x: existing.x + deltaX,
            y: existing.y + deltaY,
          },
        }
      })
    },
    [effectiveAlignTarget, selectedGroupId],
  )

  useEffect(() => {
    // Dataset pixels use a top-left origin (y down), so ArrowUp decreases y.
    const arrowVectors = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    }

    const handleKeyDown = (event) => {
      if (isImporting) return
      if (isEditableTarget(event.target)) return
      if (anchorMode) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelAnchor()
        }
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const direction = arrowVectors[event.key]
      if (!direction) return
      if (effectiveAlignTarget === 'annotation' && !currentGeojsonData) return
      if (effectiveAlignTarget === 'image' && !selectedGroup?.ihc) return

      event.preventDefault()
      nudgeOffset(direction.x, direction.y)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    anchorMode,
    cancelAnchor,
    currentGeojsonData,
    effectiveAlignTarget,
    isImporting,
    nudgeOffset,
    selectedGroup?.ihc,
  ])

  const openImportPicker = useCallback(() => {
    if (isImporting) return
    setSourcesDialogOpen(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }, [isImporting])

  const openSourcesDialog = useCallback(() => {
    if (isImporting) return
    setSourcesDialogOpen(true)
  }, [isImporting])

  const runImport = async (entries, datasetName, options = {}) => {
    if (isImporting) return

    setIsImporting(true)
    setImportProgress({
      processed: 0,
      total: entries.length,
      stage: '正在扫描目录',
      fileName: '',
    })

    try {
      const { files, errors } = await prepareFiles(entries, {
        onProgress: (progress) => setImportProgress(progress),
      })

      if (!files.length) {
        throw new Error('没有找到可读取的 .tif / .tiff / .geojson 文件')
      }

      const grouped = groupFiles(files, {
        forceSingleGroup: Boolean(options.manual),
      })
      const nextDataset = {
        name: datasetName || '本地切片数据集',
        source: 'upload',
        files,
        ...grouped,
      }
      const preferredGroup =
        grouped.groups.find(
          (group) => group.he && group.ihc && group.geojson,
        ) ||
        grouped.groups.find((group) => group.he && group.ihc) ||
        grouped.groups[0] ||
        null

      // Invalidate all in-flight lazy loads from the previous dataset, then
      // release their display URLs once React has painted the new dataset.
      const previousUrls = new Set(objectUrlsRef.current)
      datasetEpochRef.current += 1
      imageCacheRef.current = {}
      geojsonCacheRef.current = {}
      setImageCache({})
      setGeojsonCache({})

      setDataset(nextDataset)
      setSelectedGroupId(preferredGroup?.id || null)
      setAnnotationOffsets({})
      setImageOffsets({})
      setAlignTarget('image')
      setAnchorMode(false)
      setAnchorPair(null)
      setLayerVisibility(createDefaultLayerVisibility())
      setSourcesDialogOpen(false)
      setSidebarOpen(false)
      setFitNonce((value) => value + 1)

      if (preferredGroup) {
        pushToast(
          `已建立 ${grouped.groups.length} 个切片对比组`,
          'success',
          `${options.manual ? '手动配对完成。' : ''}匹配 ${grouped.stats.he} 张 HE、${grouped.stats.ihc} 张 IHC，${grouped.stats.matchedGeojson} 份标注已关联。图片与标注按需加载。`,
        )
      } else {
        pushToast(
          '未识别出 HE / IHC 切片组',
          'warning',
          '文件已保留在“未分组文件”中。请选择包含 he / ihc / he_geo / ihc_geo 子目录的上级目录，或检查文件名。',
        )
      }

      if (errors.length > 0) {
        const detail = errors
          .slice(0, 2)
          .map((error) => `${error.fileName}：${error.message}`)
          .join('；')
        pushToast(`${errors.length} 个文件解析失败`, 'warning', detail)
      }

      window.setTimeout(() => {
        previousUrls.forEach((url) => {
          URL.revokeObjectURL(url)
          objectUrlsRef.current.delete(url)
        })
      }, 1000)
    } catch (error) {
      pushToast(
        '数据导入失败',
        'error',
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      setIsImporting(false)
      window.setTimeout(() => setImportProgress(null), 180)
    }
  }

  const handleFolderSelection = async (event) => {
    // Copy the FileList before resetting the input. Resetting a file input can
    // invalidate its live FileList, leaving the picker apparently unresponsive.
    const selectedFiles = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selectedFiles.length) return
    await runImport(selectedFiles, getDatasetFolderName(selectedFiles))
  }

  const handleSourceImport = (entries, datasetName, options = {}) => {
    setSourcesDialogOpen(false)
    runImport(entries, datasetName, options)
  }

  useEffect(() => {
    if (sourcesDialogOpen || isImporting) return undefined

    let dragDepth = 0
    const hasFiles = (event) =>
      Array.from(event.dataTransfer?.types || []).includes('Files')

    const handleDragEnter = (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth += 1
      setDragActive(true)
    }

    const handleDragOver = (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }

    const handleDragLeave = (event) => {
      if (!hasFiles(event)) return
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) setDragActive(false)
    }

    const handleDragEnd = () => {
      dragDepth = 0
      setDragActive(false)
    }

    const handleDrop = async (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      dragDepth = 0
      setDragActive(false)

      try {
        const droppedEntries = await collectDroppedEntries(event.dataTransfer)
        if (!droppedEntries.length) {
          throw new Error('没有找到可读取的 TIFF / GeoJSON 文件')
        }

        const { slots, unclassified } = splitEntriesByRole(droppedEntries)
        if (!slots.heImages.length || !slots.ihcImages.length) {
          setSourcesDialogOpen(true)
          pushToast(
            '自动识别不完整',
            'warning',
            '拖入内容中没有同时识别出 HE 和 IHC 图像，请在导入窗口中手动选择或拖到对应卡片。',
          )
          return
        }

        const importEntries = []
        Object.entries(DROP_ROLE_CONFIG).forEach(([key, config]) => {
          ;(slots[key] || []).forEach((entry) => {
            importEntries.push({
              file: entry.file,
              role: config.role,
              annotationSide: config.annotationSide,
              path: `${config.prefix}/${entry.path}`,
            })
          })
        })
        unclassified.forEach((entry) => {
          importEntries.push({ file: entry.file, path: entry.path })
        })

        const manual =
          slots.heImages.length === 1 &&
          slots.ihcImages.length === 1 &&
          slots.heGeojson.length <= 1 &&
          slots.ihcGeojson.length <= 1

        const folderNames = new Set()
        droppedEntries.forEach((entry) => {
          const dirs = entry.path.split('/').slice(0, -1)
          const folder = dirs[dirs.length - 1]
          if (folder) folderNames.add(folder)
        })
        const datasetName =
          folderNames.size === 1
            ? [...folderNames][0]
            : manual
              ? '手动配对切片'
              : '拖入切片数据'

        if (unclassified.length > 0) {
          pushToast(
            `${unclassified.length} 个文件未自动归类`,
            'warning',
            '其余文件已导入，未识别文件会出现在“未分组文件”中。',
          )
        }
        await runImport(importEntries, datasetName, { manual })
      } catch (error) {
        pushToast(
          '拖入导入失败',
          'error',
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('dragend', handleDragEnd)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('dragend', handleDragEnd)
      window.removeEventListener('drop', handleDrop)
      setDragActive(false)
    }
  }, [isImporting, pushToast, sourcesDialogOpen])

  const handleExport = useCallback(() => {
    if (!currentGeojsonData || !resolvedIhcAnnotationFile) {
      pushToast('当前切片组没有可导出的 IHC GeoJSON', 'warning')
      return
    }
    try {
      const name = downloadGeoJSON(
        currentGeojsonData,
        resolvedIhcAnnotationFile.name,
        annotationOffset.x,
        annotationOffset.y,
      )
      pushToast(
        '配准结果已导出',
        'success',
        `${name} · 标测偏移 X ${formatSigned(annotationOffset.x)} / Y ${formatSigned(annotationOffset.y)} px`,
      )
    } catch (error) {
      pushToast(
        '导出失败',
        'error',
        error instanceof Error ? error.message : String(error),
      )
    }
  }, [
    annotationOffset.x,
    annotationOffset.y,
    currentGeojsonData,
    pushToast,
    resolvedIhcAnnotationFile,
  ])

  const handleRestoreDemo = useCallback(() => {
    if (isImporting) return
    const demo = createDemoDataset()
    const urls = new Set(objectUrlsRef.current)
    datasetEpochRef.current += 1
    imageCacheRef.current = {}
    geojsonCacheRef.current = {}
    setImageCache({})
    setGeojsonCache({})
    setDataset(demo)
    setSelectedGroupId(demo.groups[0]?.id || null)
    setAnnotationOffsets({})
    setImageOffsets({})
    setAlignTarget('image')
    setAnchorMode(false)
    setAnchorPair(null)
    setLayerVisibility(createDefaultLayerVisibility())
    setSidebarOpen(false)
    setFitNonce((value) => value + 1)

    window.setTimeout(() => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url)
        objectUrlsRef.current.delete(url)
      })
    }, 500)
    pushToast(
      '已载入内置演示病例',
      'info',
      `${demo.groups.length} 个 HE / IHC 配对病例可直接查看。`,
    )
  }, [isImporting, pushToast])

  const hasFiles = dataset.files.length > 0

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#1e1e1e] text-[#cccccc]">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        accept=".tif,.tiff,.geojson"
        onChange={handleFolderSelection}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <TopBar
        syncEnabled={syncEnabled}
        onToggleSync={() => setSyncEnabled((value) => !value)}
        onImport={openSourcesDialog}
        onExport={handleExport}
        canExport={canExport}
        isImporting={isImporting}
        exportFileName={registeredFileName}
        onToggleSidebar={() => setSidebarOpen((value) => !value)}
      />

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="关闭文件目录"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px] min-[960px]:hidden"
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 z-40 shadow-[18px_0_50px_rgba(0,0,0,0.4)] min-[960px]:static min-[960px]:z-auto min-[960px]:flex min-[960px]:shadow-none ${
            sidebarOpen ? 'flex' : 'hidden'
          }`}
        >
          <Sidebar
            dataset={dataset}
            selectedGroupId={selectedGroupId}
            selectedGroup={selectedGroup}
            onSelectGroup={handleSelectGroup}
            onImport={openSourcesDialog}
            onRestoreDemo={handleRestoreDemo}
            isImporting={isImporting}
          />
        </div>

        <main className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          {selectedGroup ? (
            <>
              <CaseStrip
                dataset={dataset}
                selectedGroup={selectedGroup}
                annotation={resolvedIhcAnnotationFile}
                annotationLoading={annotationLoading}
                annotationError={annotationError}
                annotationOffset={annotationOffset}
                imageOffset={imageOffset}
                alignTarget={effectiveAlignTarget}
                hasIhcImage={Boolean(selectedGroup?.ihc)}
                hasIhcAnnotation={Boolean(ihcAnnotationDescriptor)}
                onSelectAlignTarget={handleSelectAlignTarget}
                onResetOffset={handleResetOffset}
                anchorMode={anchorMode}
                anchorPair={anchorPair}
                onToggleAnchorMode={handleToggleAnchorMode}
                onFinishAnchor={finishAnchor}
                onCancelAnchor={cancelAnchor}
              />

              <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
                <SliceViewer
                  kind="he"
                  viewIndex={1}
                  imageFile={resolvedHeFile}
                  annotationLayers={heViewAnnotations}
                  annotationOffsets={annotationLayerOffsets}
                  imageOffset={EMPTY_OFFSET}
                  fitNonce={fitNonce}
                  onMapReady={handleRegisterMap}
                  onViewChange={handleMapViewChange}
                  onZoomAnim={handleMapZoomAnim}
                  onResetOffset={NOOP}
                  onToggleAnnotationLayer={handleToggleHeViewLayer}
                  anchorMode={anchorMode}
                  anchorPair={anchorPair}
                  onAnchorPlace={handleAnchorPlace}
                  onAnchorDrag={handleAnchorDrag}
                />
                <SliceViewer
                  kind="ihc"
                  viewIndex={2}
                  imageFile={resolvedIhcFile}
                  annotationLayers={ihcViewAnnotations}
                  annotationOffsets={annotationLayerOffsets}
                  imageOffset={imageOffset}
                  activeTarget={effectiveAlignTarget}
                  activeOffset={activeOffset}
                  fitNonce={fitNonce}
                  onMapReady={handleRegisterMap}
                  onViewChange={handleMapViewChange}
                  onZoomAnim={handleMapZoomAnim}
                  onResetOffset={handleResetOffset}
                  onToggleAnnotationLayer={handleToggleIhcViewLayer}
                  anchorMode={anchorMode}
                  anchorPair={anchorPair}
                  onAnchorPlace={handleAnchorPlace}
                  onAnchorDrag={handleAnchorDrag}
                />
              </div>
            </>
          ) : (
            <WorkspaceEmpty
              hasFiles={hasFiles}
              onImport={openSourcesDialog}
              onRestoreDemo={handleRestoreDemo}
            />
          )}
        </main>
      </div>

      {dragActive && !sourcesDialogOpen && !isImporting && (
        <div className="pointer-events-none fixed inset-0 z-[9100] flex items-center justify-center bg-[#0d1014]/72 p-6 backdrop-blur-[2px]">
          <div className="flex max-w-[430px] flex-col items-center rounded-2xl border border-[#4c6e9f]/70 bg-[#232b35]/96 px-8 py-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#6b92c6]/60 bg-[#2c3d52] text-[#a9ceff]">
              <UploadCloud className="h-7 w-7" strokeWidth={1.5} />
            </div>
            <h2 className="mt-4 text-[15px] font-medium text-[#e6eef8]">
              松开以导入 HE / IHC 数据
            </h2>
            <p className="mt-2 text-[10px] leading-5 text-[#8e9cad]">
              支持四个文件夹、四个单文件，或包含 he / ihc / *_geo 子目录的上级目录。
              拖入后会自动识别并匹配；如需手动分配，请使用导入窗口。
            </p>
          </div>
        </div>
      )}

      {sourcesDialogOpen && (
        <ImportSourcesDialog
          onClose={() => setSourcesDialogOpen(false)}
          onImport={handleSourceImport}
          onSingleFolder={() => {
            setSourcesDialogOpen(false)
            openImportPicker()
          }}
        />
      )}

      {isImporting && <ImportOverlay progress={importProgress} />}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
