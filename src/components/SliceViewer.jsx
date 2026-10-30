import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  AlertTriangle,
  Crosshair,
  EyeOff,
  FileImage,
  ImageOff,
  Layers3,
  Loader2,
  Maximize2,
  Move3d,
  RotateCcw,
} from 'lucide-react'
import { countGeoJSONFeatures, toLeafletGeoJSON } from '../utils/geojson'

const KIND_META = {
  he: {
    label: 'HE 染色',
    short: 'HE',
    badge:
      'border-[#f2a4bd]/20 bg-[#f2a4bd]/10 text-[#f1afc5] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  },
  ihc: {
    label: 'IHC 染色',
    short: 'IHC',
    badge:
      'border-[#e4b577]/20 bg-[#e4b577]/10 text-[#e9c286] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  },
}

const ANNOTATION_META = {
  he: {
    label: 'HE',
    stroke: '#ff416c',
    fill: '#ff2d62',
    dot: '#ff7a9a',
    fillOpacity: 0.16,
    weight: 1.5,
    chip: 'border-[#633c47]/80 bg-[#2a1e23]/90 text-[#e7a0b4]',
    dotClass: 'bg-[#ff6f91]',
  },
  ihc: {
    label: 'IHC',
    stroke: '#65e6b2',
    fill: '#2bd29b',
    dot: '#a7f4d4',
    fillOpacity: 0.22,
    weight: 2,
    chip: 'border-[#315b4c]/80 bg-[#17241f]/90 text-[#9bd6bd]',
    dotClass: 'bg-[#5be4ae]',
  },
}

const LAYER_PANE_IDS = {
  he: 'annotationHePane',
  ihc: 'annotationIhcPane',
}

const EMPTY_OFFSET = Object.freeze({ x: 0, y: 0 })

/**
 * Convert a Leaflet lat/lng into dataset pixel coordinates.
 * Dataset pixels use a top-left origin with y growing downward, while Leaflet
 * CRS.Simple grows y upward, so the conversion flips y.
 */
function latLngToImagePoint(latlng, imageHeight) {
  return {
    x: Number(latlng.lng),
    y: Number(imageHeight) - Number(latlng.lat),
  }
}

/** Convert dataset pixel coordinates into a Leaflet lat/lng. */
function imagePointToLatLng(point, imageHeight) {
  return L.latLng(Number(imageHeight) - point.y, point.x)
}

function formatSigned(value) {
  return `${value >= 0 ? '+' : ''}${value}`
}

function formatCoordinate(value) {
  if (value === null || value === undefined) return '—'
  return Number(value).toFixed(1)
}

function EmptyImageState({ kind, title, description, icon: Icon = ImageOff }) {
  return (
    <div className="absolute inset-0 z-[650] flex items-center justify-center bg-[#181a1d]/78 p-6 backdrop-blur-[1.5px]">
      <div className="max-w-[310px] text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#3e4858] bg-[#252b33] shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
          <Icon className="h-6 w-6 text-[#7e93b4]" strokeWidth={1.45} />
        </div>
        <h3 className="mt-4 text-[13px] font-medium text-[#d9dee5]">{title}</h3>
        <p className="mt-2 text-[10.5px] leading-5 text-[#7f8895]">{description}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#343b46] bg-[#22262c] px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.08em] text-[#6f7d91]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#536076]" />
          {kind === 'he' ? 'HE 参考视图' : 'IHC 标测视图'}
        </div>
      </div>
    </div>
  )
}

function SliceViewer({
  kind,
  viewIndex,
  imageFile,
  annotationLayers = [],
  annotationOffsets = {},
  imageOffset = EMPTY_OFFSET,
  activeTarget = 'image',
  activeOffset = EMPTY_OFFSET,
  fitNonce,
  onMapReady,
  onViewChange,
  onZoomAnim,
  onResetOffset,
  onToggleAnnotationLayer,
  anchorMode = false,
  anchorPair = null,
  onAnchorPlace,
  onAnchorDrag,
}) {
  const meta = KIND_META[kind]
  const mapNodeRef = useRef(null)
  const mapRef = useRef(null)
  const imageLayerRef = useRef(null)
  const annotationLayerRefs = useRef({})
  const annotationRendererRefs = useRef({})
  const onMapReadyRef = useRef(onMapReady)
  const onViewChangeRef = useRef(onViewChange)
  const onZoomAnimRef = useRef(onZoomAnim)
  const cursorFrameRef = useRef(0)
  const anchorLayerRef = useRef(null)
  const anchorRef = useRef({ anchorMode: false, onAnchorPlace: null })
  const viewRef = useRef({ image: null })

  const [mapReady, setMapReady] = useState(false)
  const [imageState, setImageState] = useState({ url: null, state: 'empty' })
  const [cursor, setCursor] = useState(null)
  const [zoom, setZoom] = useState(-1)

  const image = imageFile?.image || null
  const fileError = imageFile?.error || null
  const imageDecoding = Boolean(imageFile?.loading) && !fileError

  viewRef.current = { image }
  anchorRef.current = { anchorMode, onAnchorPlace }

  const availableLayers = useMemo(
    () => annotationLayers.filter((layer) => Boolean(layer.file)),
    [annotationLayers],
  )
  const layerDetails = useMemo(
    () =>
      availableLayers.map((layer) => ({
        ...layer,
        featureCount: countGeoJSONFeatures(layer.file?.geojson),
        loading: Boolean(layer.file?.loading) && !layer.file?.error,
        error: layer.file?.error || null,
        dataReady: Boolean(layer.file?.geojson),
      })),
    [availableLayers],
  )
  const layerDataSignature = annotationLayers
    .map(
      (layer) =>
        `${layer.key}:${layer.visible ? 1 : 0}:${layer.file?.id || 'none'}:${
          layer.file?.error
            ? 'error'
            : layer.file?.geojson
              ? 'ready'
              : layer.file?.loading
                ? 'loading'
                : 'empty'
        }`,
    )
    .join('|')
  const annotationError = layerDetails.find((layer) => layer.error)?.error
  const activeLayerCount = layerDetails.filter(
    (layer) => layer.visible && layer.dataReady,
  ).length

  const resolvedImageState = !image?.url
    ? 'empty'
    : imageState.url === image.url
      ? imageState.state
      : 'loading'

  useEffect(() => {
    onMapReadyRef.current = onMapReady
  }, [onMapReady])

  useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  useEffect(() => {
    onZoomAnimRef.current = onZoomAnim
  }, [onZoomAnim])

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return undefined

    const map = L.map(mapNodeRef.current, {
      crs: L.CRS.Simple,
      minZoom: -6,
      maxZoom: 5,
      zoomSnap: 0.05,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 105,
      zoomControl: false,
      attributionControl: false,
      keyboard: false,
      doubleClickZoom: true,
      scrollWheelZoom: true,
      touchZoom: true,
      zoomAnimation: true,
      preferCanvas: false,
    })

    mapRef.current = map
    map.createPane('slidePane')
    const slidePane = map.getPane('slidePane')
    slidePane.style.zIndex = '210'
    slidePane.style.pointerEvents = 'none'
    slidePane.style.willChange = 'transform'

    ;['he', 'ihc'].forEach((layerKey, index) => {
      map.createPane(LAYER_PANE_IDS[layerKey])
      const pane = map.getPane(LAYER_PANE_IDS[layerKey])
      pane.style.zIndex = String(410 + index)
      pane.style.pointerEvents = 'none'
      pane.style.willChange = 'transform'
    })

    map.setView([500, 500], -1, { animate: false })
    L.control
      .zoom({
        position: 'bottomright',
        zoomInTitle: '放大',
        zoomOutTitle: '缩小',
      })
      .addTo(map)

    const emitView = () => {
      const currentMap = mapRef.current
      if (!currentMap || currentMap._animatingZoom) return
      const center = currentMap.getCenter()
      onViewChangeRef.current?.(
        kind,
        { lat: center.lat, lng: center.lng },
        currentMap.getZoom(),
      )
    }

    const handleZoomAnim = (event) => {
      if (!event?.center || event.zoom === undefined) return
      onZoomAnimRef.current?.(
        kind,
        { lat: event.center.lat, lng: event.center.lng },
        event.zoom,
      )
    }

    const handleMouseMove = (event) => {
      if (cursorFrameRef.current) return
      cursorFrameRef.current = window.requestAnimationFrame(() => {
        cursorFrameRef.current = 0
        setCursor({ x: event.latlng.lng, y: event.latlng.lat })
      })
    }

    const handleMouseOut = () => {
      if (cursorFrameRef.current) {
        window.cancelAnimationFrame(cursorFrameRef.current)
        cursorFrameRef.current = 0
      }
      setCursor(null)
    }

    const handleZoom = () => setZoom(map.getZoom())

    const handleMapClick = (event) => {
      const { image: currentImage } = viewRef.current
      const { anchorMode: active, onAnchorPlace: place } = anchorRef.current
      if (!active || !currentImage) return
      const point = latLngToImagePoint(event.latlng, currentImage.height)
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
      place?.(kind, point)
    }

    map.on('move', emitView)
    map.on('zoomanim', handleZoomAnim)
    map.on('zoomend', handleZoom)
    map.on('mousemove', handleMouseMove)
    map.on('mouseout', handleMouseOut)
    map.on('click', handleMapClick)

    setZoom(map.getZoom())
    setMapReady(true)
    onMapReadyRef.current?.(kind, map)

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        if (mapRef.current) mapRef.current.invalidateSize({ pan: false })
      })
    })
    resizeObserver.observe(mapNodeRef.current)

    return () => {
      resizeObserver.disconnect()
      if (cursorFrameRef.current) window.cancelAnimationFrame(cursorFrameRef.current)
      cursorFrameRef.current = 0
      map.off()
      onMapReadyRef.current?.(kind, null)
      map.remove()
      mapRef.current = null
      imageLayerRef.current = null
      annotationLayerRefs.current = {}
      annotationRendererRefs.current = {}
      setMapReady(false)
    }
  }, [kind])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    if (imageLayerRef.current) {
      map.removeLayer(imageLayerRef.current)
      imageLayerRef.current = null
    }

    if (!image?.url) {
      setImageState({ url: null, state: 'empty' })
      return undefined
    }

    setImageState({ url: image.url, state: 'loading' })
    const bounds = L.latLngBounds(
      [0, 0],
      [Number(image.height) || 1000, Number(image.width) || 1000],
    )
    const layer = L.imageOverlay(image.url, bounds, {
      pane: 'slidePane',
      interactive: false,
      className: 'slice-image-overlay',
      alt: imageFile?.name || meta.label,
    })

    layer.on('load', () => {
      if (imageLayerRef.current === layer) {
        setImageState({ url: image.url, state: 'ready' })
      }
    })
    layer.on('error', () => {
      if (imageLayerRef.current === layer) {
        setImageState({ url: image.url, state: 'error' })
      }
    })
    layer.addTo(map)
    imageLayerRef.current = layer

    return () => {
      if (imageLayerRef.current === layer) imageLayerRef.current = null
      if (map.hasLayer(layer)) map.removeLayer(layer)
    }
  }, [mapReady, image?.url, image?.width, image?.height, imageFile?.name, meta.label])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    if (!image?.url) {
      map.setMaxBounds(null)
      return
    }

    const bounds = L.latLngBounds(
      [0, 0],
      [Number(image.height) || 1000, Number(image.width) || 1000],
    )

    map.setMaxBounds(bounds.pad(0.85))
    map.fitBounds(bounds, {
      padding: [12, 12],
      animate: false,
    })
    setZoom(map.getZoom())
    window.requestAnimationFrame(() => {
      if (mapRef.current) mapRef.current.invalidateSize({ pan: false })
    })
  }, [mapReady, image?.url, image?.width, image?.height, fitNonce])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    const removeExistingLayers = () => {
      Object.entries(annotationLayerRefs.current).forEach(([key, layer]) => {
        if (layer && map.hasLayer(layer)) map.removeLayer(layer)
        annotationLayerRefs.current[key] = null
      })
    }

    removeExistingLayers()
    if (!image?.url) return removeExistingLayers

    annotationLayers.forEach((layer) => {
      if (!layer.visible || !layer.file?.geojson) return
      const palette = ANNOTATION_META[layer.key] || ANNOTATION_META.ihc
      const paneId = LAYER_PANE_IDS[layer.key] || LAYER_PANE_IDS.ihc
      // A pane-translated SVG renderer with the default 0.1 padding clips its
      // content once the annotation offset exceeds ~10% of the viewport, which
      // shows up as a blank edge at high zoom. A full viewport of padding on
      // every side keeps the shifted content inside the SVG for any offset
      // that is still visible on screen.
      let renderer = annotationRendererRefs.current[layer.key]
      if (!renderer) {
        renderer = L.svg({ pane: paneId, padding: 1.2 })
        renderer.addTo(map)
        annotationRendererRefs.current[layer.key] = renderer
      }
      const geo = L.geoJSON(
        toLeafletGeoJSON(layer.file.geojson, {
          offsetX: 0,
          offsetY: 0,
          imageHeight: image.height,
        }),
        {
          pane: paneId,
          renderer,
          interactive: false,
          className: 'annotation-path',
          style: () => ({
            color: palette.stroke,
            weight: palette.weight,
            opacity: 0.96,
            fillColor: palette.fill,
            fillOpacity: palette.fillOpacity,
            lineCap: 'round',
            lineJoin: 'round',
          }),
          pointToLayer: (_feature, latlng) =>
            L.circleMarker(latlng, {
              pane: paneId,
              renderer,
              radius: 4.5,
              color: palette.dot,
              weight: 1.5,
              opacity: 1,
              fillColor: palette.fill,
              fillOpacity: 0.88,
              interactive: false,
              className: 'annotation-path',
            }),
        },
      )
      geo.addTo(map)
      annotationLayerRefs.current[layer.key] = geo
    })

    return removeExistingLayers
  }, [
    mapReady,
    image?.url,
    image?.height,
    layerDataSignature,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    const applyOffsets = () => {
      const scale = map.options.crs.scale(map.getZoom())
      Object.keys(LAYER_PANE_IDS).forEach((key) => {
        const pane = map.getPane(LAYER_PANE_IDS[key])
        if (!pane) return
        const offset = annotationOffsets[key] || EMPTY_OFFSET
        const x = offset.x * scale
        // Offsets are stored in dataset pixels (y down), which matches CSS
        // translate3d where +y moves down the screen.
        const y = offset.y * scale
        pane.style.transform = `translate3d(${x}px, ${y}px, 0)`
      })
    }

    applyOffsets()
    map.on('zoom', applyOffsets)
    map.on('zoomend', applyOffsets)

    return () => {
      map.off('zoom', applyOffsets)
      map.off('zoomend', applyOffsets)
    }
  }, [mapReady, annotationOffsets])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined
    const pane = map.getPane('slidePane')
    if (!pane) return undefined

    const applyImageOffset = () => {
      const scale = map.options.crs.scale(map.getZoom())
      const x = imageOffset.x * scale
      const y = imageOffset.y * scale
      pane.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }

    applyImageOffset()
    map.on('zoom', applyImageOffset)
    map.on('zoomend', applyImageOffset)

    return () => {
      map.off('zoom', applyImageOffset)
      map.off('zoomend', applyImageOffset)
    }
  }, [mapReady, imageOffset])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return undefined

    const removeAnchor = () => {
      if (anchorLayerRef.current) {
        if (map.hasLayer(anchorLayerRef.current)) {
          map.removeLayer(anchorLayerRef.current)
        }
        anchorLayerRef.current = null
      }
    }

    removeAnchor()
    if (!anchorMode || !anchorPair || !image?.url) return removeAnchor

    const point = anchorPair[kind]
    if (!point) return removeAnchor

    const fixed = anchorPair.sourceSide === kind
    const marker = L.marker(
      imagePointToLatLng(point, image.height),
      {
        draggable: !fixed,
        keyboard: false,
        autoPan: false,
        zIndexOffset: 1400,
        title: fixed ? '基准锚点（固定）' : '拖动此锚点与另一侧对齐',
        icon: L.divIcon({
          className: `anchor-marker ${
            fixed ? 'anchor-marker--fixed' : 'anchor-marker--moving'
          }`,
          html: '<span class="anchor-marker__ring"></span><span class="anchor-marker__cross"></span><span class="anchor-marker__dot"></span>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      },
    )

    if (!fixed) {
      marker.on('dragend', () => {
        const next = latLngToImagePoint(marker.getLatLng(), image.height)
        if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return
        onAnchorDrag?.(kind, next)
      })
    }

    marker.addTo(map)
    anchorLayerRef.current = marker

    return () => {
      if (anchorLayerRef.current === marker) {
        anchorLayerRef.current = null
      }
      if (map.hasLayer(marker)) map.removeLayer(marker)
    }
  }, [
    mapReady,
    anchorMode,
    anchorPair,
    image?.url,
    image?.height,
    kind,
    onAnchorDrag,
  ])

  const fitView = useCallback(() => {
    const map = mapRef.current
    if (!map || !image) return
    const bounds = L.latLngBounds(
      [0, 0],
      [Number(image.height) || 1000, Number(image.width) || 1000],
    )
    map.fitBounds(bounds, { padding: [12, 12], animate: true, duration: 0.24 })
  }, [image])

  const zoomPercent = useMemo(() => Math.round(2 ** zoom * 100), [zoom])
  const isImageLoading =
    Boolean(image?.url) && resolvedImageState === 'loading'
  const hasImageError =
    Boolean(image?.url) && resolvedImageState === 'error'
  const showImagePlaceholder = !image?.url && !fileError && !imageDecoding
  const showErrorPlaceholder = Boolean(fileError) || hasImageError
  const showActiveOffsetHud = kind === 'ihc' && image?.url && !showErrorPlaceholder
  const anchorDelta = anchorPair
    ? {
        x: Math.round((anchorPair.he.x - anchorPair.ihc.x) * 100) / 100,
        y: Math.round((anchorPair.he.y - anchorPair.ihc.y) * 100) / 100,
      }
    : null

  return (
    <section
      aria-label={`${meta.label} 视图`}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[#38475d] bg-[#2d2d2d] shadow-panel"
    >
      <header className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[#3b4554] bg-[linear-gradient(180deg,#303134,#2b2c2f)] px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border font-mono text-[9px] font-semibold tracking-[0.02em] ${meta.badge}`}
          >
            {meta.short}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="whitespace-nowrap text-[12.5px] font-semibold text-[#e8ebef]">
                {meta.label}
              </span>
              <span className="hidden h-2.5 w-px bg-[#484c54] sm:block" />
              <span className="hidden whitespace-nowrap font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#7c8590] sm:block">
                View {viewIndex}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  fileError || resolvedImageState === 'error'
                    ? 'bg-[#e38a65]'
                    : imageDecoding
                      ? 'animate-pulse bg-[#d8ad63]'
                      : resolvedImageState === 'ready'
                        ? 'bg-[#61d3a7]'
                        : 'bg-[#59616c]'
                }`}
              />
              <p
                className="min-w-0 truncate font-mono text-[9.5px] text-[#858e99]"
                title={imageFile?.path || imageFile?.name || '未加载切片'}
              >
                {imageFile?.name || '未加载切片'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={fitView}
            disabled={!image}
            title="适配视图（缩放至整张切片）"
            aria-label="适配视图"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[#41464e] bg-[#2c2e33] text-[#8e98a5] transition-colors hover:border-[#53627a] hover:bg-[#343942] hover:text-[#c7d4e8] disabled:cursor-default disabled:opacity-40"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <div
        className={`viewer-map relative min-h-0 flex-1 overflow-hidden ${
          !image?.url || showErrorPlaceholder ? 'no-image' : ''
        } ${anchorMode && image?.url ? 'anchor-cursor' : ''}`}
      >
        <div
          ref={mapNodeRef}
          role="application"
          aria-label={`${meta.label} 交互式切片查看器`}
          // Leaflet mutates this DOM node's classes. Keep React's className
          // static so an image-state update cannot strip leaflet-container.
          className="absolute inset-0"
        />

        {(isImageLoading || imageDecoding) && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[640] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-md border border-[#3a4554] bg-[#1d2127]/92 px-3 py-2 text-[10px] text-[#adbbce] shadow-lg backdrop-blur-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7ea8f5]" />
            {imageDecoding ? '正在解码 TIFF 切片' : '正在渲染切片'}
          </div>
        )}

        {anchorMode && image?.url && !showErrorPlaceholder && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[690] flex max-w-[calc(100%-132px)] -translate-x-1/2 flex-col gap-0.5 rounded-md border border-[#8a6430]/80 bg-[#2b2113]/94 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.32)] backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Crosshair
                className="h-3.5 w-3.5 shrink-0 text-[#f0c987]"
                strokeWidth={1.8}
              />
              <span className="truncate text-[9.5px] text-[#e3cda5]">
                {!anchorPair
                  ? '点击本图放置配准锚点'
                  : anchorPair.sourceSide === kind
                    ? '基准锚点已固定 · 在另一侧拖动'
                    : '拖动锚点对齐到对应结构，然后点“完成”'}
              </span>
            </div>
            {anchorDelta && (
              <span className="pl-[22px] font-mono text-[8.5px] whitespace-nowrap text-[#e8cf9f]/90">
                ΔX {formatSigned(anchorDelta.x)} · ΔY {formatSigned(anchorDelta.y)} px
              </span>
            )}
          </div>
        )}

        {showErrorPlaceholder && (
          <EmptyImageState
            kind={kind}
            title={fileError ? `${meta.label}切片读取失败` : '图像加载失败'}
            description={
              fileError ||
              '切片预览无法加载。请确认 TIFF 文件未损坏，然后重新导入文件夹。'
            }
            icon={AlertTriangle}
          />
        )}

        {showImagePlaceholder && !showErrorPlaceholder && (
          <EmptyImageState
            kind={kind}
            title={
              kind === 'he'
                ? '当前切片组未包含 HE 切片'
                : '当前切片组未包含 IHC 切片'
            }
            description={
              kind === 'he'
                ? '请检查文件名或目录结构，例如 HE_patient01.tif。'
                : '请检查文件名或目录结构，例如 IHC_patient01.tif。'
            }
            icon={FileImage}
          />
        )}

        {showActiveOffsetHud && (
          <div
            className={`pointer-events-auto absolute right-3 top-3 z-[680] flex items-center gap-2 rounded-md border px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.26)] backdrop-blur-md ${
              activeTarget === 'image'
                ? 'border-[#385b84]/80 bg-[#17212b]/92'
                : 'border-[#315b4d]/80 bg-[#17241f]/90'
            }`}
          >
            <Move3d
              className={`h-3.5 w-3.5 ${
                activeTarget === 'image' ? 'text-[#78b8f0]' : 'text-[#70d8b0]'
              }`}
              strokeWidth={1.7}
            />
            <span className="text-[9px] font-medium tracking-[0.03em] text-[#9bb1c4]">
              {activeTarget === 'image' ? '图像配准' : '标测偏移'}
            </span>
            <span className="ml-0.5 flex items-center gap-1.5 font-mono text-[9.5px] text-[#d2e4e0]">
              <span>X {formatSigned(activeOffset.x)}</span>
              <span className="h-2.5 w-px bg-white/10" />
              <span>Y {formatSigned(activeOffset.y)}</span>
            </span>
            {(activeOffset.x !== 0 || activeOffset.y !== 0) && (
              <button
                type="button"
                onClick={onResetOffset}
                title="将当前偏移归零"
                aria-label="将当前偏移归零"
                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-[#8ca6b9] transition-colors hover:bg-white/[0.07] hover:text-[#d4ebe1]"
              >
                <RotateCcw className="h-3 w-3" strokeWidth={1.8} />
              </button>
            )}
          </div>
        )}

        {kind === 'ihc' &&
          image?.url &&
          !showErrorPlaceholder &&
          annotationError && (
            <div className="absolute left-3 top-3 z-[680] flex max-w-[280px] items-start gap-2 rounded-md border border-[#6a5131]/80 bg-[#2b241a]/92 px-2.5 py-2 text-[9.5px] leading-4 text-[#d6b27c] shadow-md backdrop-blur-md">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">标测加载失败：{annotationError}</span>
            </div>
          )}

        {layerDetails.length > 0 &&
          image?.url &&
          !showErrorPlaceholder && (
            <div className="absolute bottom-3 left-3 z-[680] flex max-w-[calc(100%-96px)] flex-wrap items-center gap-1.5">
              {layerDetails.map((layer) => {
                const palette = ANNOTATION_META[layer.key] || ANNOTATION_META.ihc
                return (
                  <button
                    key={layer.key}
                    type="button"
                    onClick={() => onToggleAnnotationLayer?.(layer.key)}
                    title={
                      layer.error ||
                      `${layer.visible ? '隐藏' : '显示'} ${palette.label} GeoJSON${
                        layer.file?.name ? `：${layer.file.name}` : ''
                      }`
                    }
                    className={`pointer-events-auto flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[8.5px] shadow-md backdrop-blur-md transition-opacity ${
                      layer.visible
                        ? palette.chip
                        : 'border-white/[0.08] bg-[#1a1d20]/78 text-[#65707c] opacity-80 hover:opacity-100'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        layer.visible ? palette.dotClass : 'bg-[#555d66]'
                      }`}
                    />
                    <span>{palette.label}</span>
                    {layer.loading ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : layer.error ? (
                      <AlertTriangle className="h-2.5 w-2.5" />
                    ) : (
                      <span className="opacity-80">{layer.featureCount}</span>
                    )}
                    {!layer.visible && <EyeOff className="h-2.5 w-2.5" />}
                  </button>
                )
              })}
            </div>
          )}

        {layerDetails.length === 0 && kind === 'he' && image?.url && !showErrorPlaceholder && (
          <div className="pointer-events-none absolute left-3 top-3 z-[660] flex items-center gap-1.5 rounded-md border border-[#3a3f47]/70 bg-[#1b1e22]/70 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#8490a0] backdrop-blur-sm">
            <Layers3 className="h-2.5 w-2.5" />
            Reference
          </div>
        )}
      </div>

      <footer className="flex h-[30px] shrink-0 items-center justify-between gap-2 border-t border-[#3b4554] bg-[#28292c] px-3 font-mono text-[8.5px] text-[#6f7781]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="whitespace-nowrap">
            {image ? `${image.width} × ${image.height} px` : '— × — px'}
          </span>
          {image?.isPreview && (
            <span className="rounded bg-[#39404b] px-1 py-[1px] text-[7.5px] text-[#9ba6b5]">
              PREVIEW
            </span>
          )}
          {layerDetails.length > 0 && (
            <span className="flex items-center gap-1 text-[#788896]">
              <Layers3 className="h-2.5 w-2.5" />
              {activeLayerCount} / {layerDetails.length} 标测
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden whitespace-nowrap sm:inline">
            X {cursor ? formatCoordinate(cursor.x) : '—'} &nbsp; Y{' '}
            {cursor ? formatCoordinate(cursor.y) : '—'}
          </span>
          <span className="whitespace-nowrap text-[#8b95a2]">{zoomPercent}%</span>
        </div>
      </footer>
    </section>
  )
}

export default memo(SliceViewer)
