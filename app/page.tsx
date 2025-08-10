'use client'

import { useEffect, useRef, useState } from 'react'

// ---------- helper: promise-based image loader (avoids tainted canvas) ----------
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // safe if you ever serve textures from a CDN
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// ---------- typed navigator helpers ----------
type ShareDataWithFiles = ShareData & { files?: File[] }
type ShareNavigator = Navigator & {
  canShare?: (data?: ShareDataWithFiles) => boolean
  share?: (data: ShareDataWithFiles) => Promise<void>
}

function hasFileShare(nav: Navigator, probe?: File): nav is ShareNavigator {
  const n = nav as ShareNavigator
  try {
    return !!n.canShare && n.canShare(probe ? { files: [probe] } : undefined)
  } catch {
    return false
  }
}

// ---------- helper: share to mobile Photos via native share sheet or fallbacks ----------
async function shareOrSave(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as ShareNavigator

  try {
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: 'Blended Image', text: 'Exported from Texture Adder' })
      return
    }
  } catch {
    // ignore and fall through to fallbacks
  }

  const url = URL.createObjectURL(blob)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isIOS) {
    window.open(url, '_blank') // long-press → “Add to Photos”
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)

  const [textureSrc, setTextureSrc] = useState<string>('magazine.jpg')
  const [blendMode, setBlendMode] = useState<GlobalCompositeOperation>('overlay')
  const [opacity, setOpacity] = useState<number>(100)
  const [brightness, setBrightness] = useState<number>(100)
  const [contrast, setContrast] = useState<number>(100)
  const [saturation, setSaturation] = useState<number>(100)
  const [dropdownOpen, setDropdownOpen] = useState<'texture' | 'blend' | null>(null)

  // Export knobs to speed up big images
  const [exportPreset, setExportPreset] = useState<'original' | '4k' | '2k' | '1080p'>('2k')
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('webp')
  const [exportQuality, setExportQuality] = useState<number>(0.92) // for jpeg/webp
  const [hiDpi, setHiDpi] = useState<boolean>(false) // off by default for speed

  // SSR-stable label; update after mount to avoid hydration mismatch
  const [canNativeShare, setCanNativeShare] = useState(false)
  useEffect(() => {
    const probe = new File([], 'probe.png', { type: 'image/png' })
    setCanNativeShare(hasFileShare(navigator, probe))
  }, [])

  const textureOptions: string[] = [
    'magazine.jpg',
    'vinyl-bleed.jpg',
    '60s-mustard.jpg',
    'royal-navy.jpg',
    'tonor.png',
    'heavy-grain.png',
  ]

  const blendOptions: GlobalCompositeOperation[] = [
    'overlay',
    'multiply',
    'screen',
    'darken',
    'lighten',
    'difference',
  ]

  useEffect(() => {
    const sliders = document.querySelectorAll('input[type="range"]')
    sliders.forEach(slider => {
      const input = slider as HTMLInputElement
      const updateTrack = () => {
        const min = Number(input.min)
        const max = Number(input.max)
        const val = Number(input.value)
        const percent = ((val - min) / (max - min)) * 100
        input.style.setProperty('--percent', `${percent}%`)
      }
      updateTrack()
      input.addEventListener('input', updateTrack)
      input.addEventListener('change', updateTrack)
    })
  }, [])

  useEffect(() => {
    if (!photo || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = photo.width
    canvas.height = photo.height

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height)
  }, [photo])

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => setPhoto(img)
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  function maxDimForPreset(preset: typeof exportPreset): number | null {
    switch (preset) {
      case '4k': return 3840
      case '2k': return 2560
      case '1080p': return 1920
      default: return null // original
    }
  }

  // ---------- export: downscale + optional HiDPI + faster decoding via ImageBitmap ----------
  const handleDownload = async () => {
    if (!photo) return

    // Decode texture and upgrade both images to ImageBitmap for faster draw
    const textureImg = await loadImage(`/textures/${textureSrc}`)
    const [photoBmp, textureBmp] = await Promise.all([
      createImageBitmap(photo),
      createImageBitmap(textureImg),
    ])

    const srcW = photoBmp.width
    const srcH = photoBmp.height
    const maxDim = maxDimForPreset(exportPreset)
    const scale =
      maxDim ? Math.min(1, maxDim / Math.max(srcW, srcH)) : 1

    const targetW = Math.max(1, Math.round(srcW * scale))
    const targetH = Math.max(1, Math.round(srcH * scale))
    const dpr = hiDpi ? (window.devicePixelRatio || 1) : 1

    // Pass 1: composite (no filters yet)
    const compCanvas = document.createElement('canvas')
    compCanvas.width = Math.round(targetW * dpr)
    compCanvas.height = Math.round(targetH * dpr)
    const compCtx = compCanvas.getContext('2d')
    if (!compCtx) return
    compCtx.imageSmoothingEnabled = true
    compCtx.imageSmoothingQuality = 'high'

    compCtx.save()
    compCtx.scale(dpr, dpr)
    compCtx.clearRect(0, 0, targetW, targetH)

    // base photo
    compCtx.globalCompositeOperation = 'source-over'
    compCtx.globalAlpha = 1
    compCtx.drawImage(photoBmp, 0, 0, targetW, targetH)

    // texture with chosen blend + opacity
    compCtx.globalAlpha = opacity / 100
    compCtx.globalCompositeOperation = blendMode
    compCtx.drawImage(textureBmp, 0, 0, targetW, targetH)
    compCtx.restore()

    // Pass 2: apply filters to merged result (matches preview)
    const outCanvas = document.createElement('canvas')
    outCanvas.width = compCanvas.width
    outCanvas.height = compCanvas.height
    const outCtx = outCanvas.getContext('2d')
    if (!outCtx) return
    outCtx.imageSmoothingEnabled = true
    outCtx.imageSmoothingQuality = 'high'

    const fBrightness = Math.max(0, brightness) / 100
    const fContrast = Math.max(0, contrast) / 100
    const fSaturation = Math.max(0, saturation) / 100
    outCtx.filter = `brightness(${fBrightness}) contrast(${fContrast}) saturate(${fSaturation})`
    outCtx.drawImage(compCanvas, 0, 0)

    const mime = exportFormat === 'png'
      ? 'image/png'
      : exportFormat === 'jpeg'
      ? 'image/jpeg'
      : 'image/webp'

    const filename =
      exportFormat === 'png' ? 'blended-image.png'
      : exportFormat === 'jpeg' ? 'blended-image.jpg'
      : 'blended-image.webp'

    await new Promise<void>((resolve) => {
      // quality only applies to lossy formats
      const quality = exportFormat === 'png' ? undefined : exportQuality
      outCanvas.toBlob(async (blob) => {
        if (!blob) return resolve()
        // Ensure blob has desired type (some browsers ignore mime in toBlob when filter is active)
        const fixedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime })
        await shareOrSave(fixedBlob, filename)
        resolve()
      }, mime, quality)
    })
  }

  const toggleDropdown = (type: 'texture' | 'blend') => {
    setDropdownOpen(dropdownOpen === type ? null : type)
  }

  const getFilterStyle = () => ({
    filter: `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`
  })

  return (
    <main className="min-h-screen bg-white text-red-700 flex flex-col items-center gap-6 p-4 font-mono">
      <h1
        style={{
          fontFamily: 'Village, monospace',
          fontSize: '12rem',
          lineHeight: '1',
          letterSpacing: '0.05em',
          animation: 'flicker 0.8s ease-in-out both',
        }}
        className="font-bold leading-none text-center"
      >
        Texture Adder
      </h1>

      <div className="flex flex-wrap gap-3 items-center justify-center">
        <label htmlFor="upload" className="cursor-pointer w-[180px] h-[40px] flex items-center justify-center border border-red-600 bg-red-600 hover:bg-red-700 text-white">
          Upload Image
        </label>
        <input type="file" id="upload" accept="image/*" onChange={handleUpload} className="hidden" />

        {/* --- Texture dropdown (string) --- */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('texture')}
            className="w-[180px] h-[40px] px-4 flex items-center justify-between bg-red-600 text-white border border-red-700 font-mono"
          >
            {textureSrc.split('.')[0]}
            <span>▼</span>
          </button>
          {dropdownOpen === 'texture' && (
            <div className="absolute top-[44px] left-0 w-[180px] z-50 border border-red-700 text-red-700 font-mono rounded shadow-lg bg-white">
              {textureOptions.map((opt) => (
                <div
                  key={opt}
                  onClick={() => {
                    setTextureSrc(opt)
                    setDropdownOpen(null)
                  }}
                  className="px-4 py-2 hover:bg-red-100 cursor-pointer"
                >
                  {opt.split('.')[0]}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- Blend dropdown (GlobalCompositeOperation) --- */}
        <div className="relative">
          <button
            onClick={() => toggleDropdown('blend')}
            className="w-[180px] h-[40px] px-4 flex items-center justify-between bg-red-600 text-white border border-red-700 font-mono"
          >
            {blendMode}
            <span>▼</span>
          </button>
          {dropdownOpen === 'blend' && (
            <div className="absolute top-[44px] left-0 w-[180px] z-50 border border-red-700 text-red-700 font-mono rounded shadow-lg bg-white">
              {blendOptions.map((opt) => (
                <div
                  key={opt}
                  onClick={() => {
                    setBlendMode(opt)
                    setDropdownOpen(null)
                  }}
                  className="px-4 py-2 hover:bg-red-100 cursor-pointer"
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Export controls */}
      <div className="flex flex-wrap gap-3 items-center justify-center">
        {/* Size preset */}
        <div className="relative">
          <button
            onClick={() => {}}
            className="w-[180px] h-[40px] px-4 flex items-center justify-between bg-white text-red-700 border border-red-700 font-mono"
            title="Export size preset"
          >
            Size: {exportPreset.toUpperCase()}
          </button>
          <div className="mt-2 w-[180px] border border-red-700 bg-white">
            {(['original','4k','2k','1080p'] as const).map(p => (
              <div
                key={p}
                onClick={() => setExportPreset(p)}
                className="px-4 py-2 hover:bg-red-100 cursor-pointer"
              >
                {p === 'original' ? 'Original' : p.toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="relative">
          <button
            onClick={() => {}}
            className="w-[180px] h-[40px] px-4 flex items-center justify-between bg-white text-red-700 border border-red-700 font-mono"
            title="Export format"
          >
            Format: {exportFormat.toUpperCase()}
          </button>
          <div className="mt-2 w-[180px] border border-red-700 bg-white">
            {(['webp','jpeg','png'] as const).map(fmt => (
              <div
                key={fmt}
                onClick={() => setExportFormat(fmt)}
                className="px-4 py-2 hover:bg-red-100 cursor-pointer"
              >
                {fmt.toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        {/* Quality (lossy only) */}
        {(exportFormat === 'jpeg' || exportFormat === 'webp') && (
          <label className="flex flex-col items-center">
            Quality
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.01"
              value={exportQuality}
              onChange={(e) => setExportQuality(parseFloat(e.target.value))}
            />
          </label>
        )}

        {/* Hi-DPI toggle */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hiDpi}
            onChange={(e) => setHiDpi(e.target.checked)}
          />
          Hi-DPI (slower)
        </label>
      </div>

      <div className="flex flex-col items-center gap-2 mt-4">
        {[
          { label: 'Opacity', value: opacity, setter: setOpacity, max: 100 },
          { label: 'Brightness', value: brightness, setter: setBrightness, max: 200 },
          { label: 'Contrast', value: contrast, setter: setContrast, max: 200 },
          { label: 'Saturation', value: saturation, setter: setSaturation, max: 200 }
        ].map(({ label, value, setter, max }, i) => (
          <div key={label} className="wave-fade" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
            <label className="flex flex-col items-center">
              {label}
              <input type="range" min="0" max={max} value={value} onChange={(e) => setter(+e.target.value)} />
            </label>
          </div>
        ))}
      </div>

      {photo && (
        <div className="mt-4 p-3 border border-neutral-700 bg-neutral-900 inline-block shadow-lg">
          <div className="relative" style={getFilterStyle()}>
            <canvas
              ref={canvasRef}
              className="w-auto h-auto max-w-full max-h-[75vh]"
              style={{ imageRendering: 'auto', display: 'block' }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={textureSrc}
              src={`/textures/${textureSrc}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'],
                opacity: opacity / 100,
                pointerEvents: 'none',
                transition: 'opacity 0.05s linear'
              }}
              alt="Texture overlay"
            />
          </div>
        </div>
      )}

      <div className="wave-fade" style={{ animationDelay: '0.8s' }}>
        <button
          onClick={handleDownload}
          className="mt-4 px-4 py-2 w-[180px] text-center border border-red-600 bg-red-600 hover:bg-red-700 text-white"
        >
          {canNativeShare ? 'Share / Save Image' : 'Download Image'}
        </button>
      </div>
    </main>
  )
}
