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

// ---------- typed navigator helpers (no `any`) ----------
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
async function shareOrSave(blob: Blob) {
  const file = new File([blob], 'blended-image.png', { type: 'image/png' })
  const nav = navigator as ShareNavigator

  // Try native share sheet with file
  try {
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({
        files: [file],
        title: 'Blended Image',
        text: 'Exported from Texture Adder',
      })
      return
    }
  } catch {
    // ignore and fall through to fallbacks
  }

  // Fallbacks
  const url = URL.createObjectURL(blob)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isIOS) {
    // Open in a new tab so the user can long-press → “Add to Photos”
    window.open(url, '_blank')
  } else {
    // Standard download
    const a = document.createElement('a')
    a.href = url
    a.download = 'blended-image.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [textureSrc, setTextureSrc] = useState('magazine.jpg')
  const [blendMode, setBlendMode] = useState<GlobalCompositeOperation>('overlay')
  const [opacity, setOpacity] = useState(100)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [dropdownOpen, setDropdownOpen] = useState<'texture' | 'blend' | null>(null)

  // SSR-stable label; update after mount to avoid hydration mismatch
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    // Probe file is required by some browsers to validate canShare({ files })
    const probe = new File([], 'probe.png', { type: 'image/png' })
    setCanNativeShare(hasFileShare(navigator, probe))
  }, [])

  const textureOptions = [
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

  // ---------- export: blend first, then apply filters to the merged result; share/save on mobile ----------
  const handleDownload = async () => {
    if (!photo) return

    // Ensure texture is decoded
    const texture = await loadImage(`/textures/${textureSrc}`)

    const dpr = window.devicePixelRatio || 1
    const W = photo.width
    const H = photo.height

    // Pass 1: composite photo + texture onto an offscreen canvas (no filters yet)
    const compCanvas = document.createElement('canvas')
    compCanvas.width = Math.round(W * dpr)
    compCanvas.height = Math.round(H * dpr)
    const compCtx = compCanvas.getContext('2d')
    if (!compCtx) return

    compCtx.save()
    compCtx.scale(dpr, dpr)
    compCtx.clearRect(0, 0, W, H)

    // base photo
    compCtx.globalCompositeOperation = 'source-over'
    compCtx.globalAlpha = 1
    compCtx.drawImage(photo, 0, 0, W, H)

    // texture with chosen blend + opacity
    compCtx.globalAlpha = opacity / 100
    compCtx.globalCompositeOperation = blendMode
    compCtx.drawImage(texture, 0, 0, W, H)
    compCtx.restore()

    // Pass 2: apply filters to the merged output (matches your on-screen CSS filter)
    const outCanvas = document.createElement('canvas')
    outCanvas.width = compCanvas.width
    outCanvas.height = compCanvas.height
    const outCtx = outCanvas.getContext('2d')
    if (!outCtx) return

    const fBrightness = Math.max(0, brightness) / 100
    const fContrast = Math.max(0, contrast) / 100
    const fSaturation = Math.max(0, saturation) / 100
    outCtx.filter = `brightness(${fBrightness}) contrast(${fContrast}) saturate(${fSaturation})`
    outCtx.drawImage(compCanvas, 0, 0)

    await new Promise<void>((resolve) => {
      outCanvas.toBlob(async (blob) => {
        if (!blob) return resolve()
        await shareOrSave(blob)
        resolve()
      }, 'image/png')
    })
  }

  const toggleDropdown = (type: 'texture' | 'blend') => {
    setDropdownOpen(dropdownOpen === type ? null : type)
  }

  const getFilterStyle = () => ({
    // This drives the live preview; export now mirrors this order
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

        {[
          { label: 'Texture', options: textureOptions, value: textureSrc, setter: setTextureSrc },
          { label: 'Blend', options: blendOptions, value: blendMode, setter: setBlendMode }
        ].map(({ label, options, value, setter }) => (
          <div key={label} className="relative">
            <button
              onClick={() => toggleDropdown(label.toLowerCase() as 'texture' | 'blend')}
              className="w-[180px] h-[40px] px-4 flex items-center justify-between bg-red-600 text-white border border-red-700 font-mono"
            >
              {value.split('.')[0]}
              <span>▼</span>
            </button>
            {dropdownOpen === label.toLowerCase() && (
              <div className="absolute top-[44px] left-0 w-[180px] z-50 border border-red-700 text-red-700 font-mono rounded shadow-lg bg-white">
                {options.map((opt) => (
                  <div
                    key={opt}
                    onClick={() => {
                      setter(opt as any) // sets string or GlobalCompositeOperation; see mapping below
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
        ))}
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
