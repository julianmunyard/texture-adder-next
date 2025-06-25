'use client'

import { useEffect, useRef, useState } from 'react'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null)
  const [textureSrc, setTextureSrc] = useState('magazine.jpg')
  const [blendMode, setBlendMode] = useState('overlay')
  const [opacity, setOpacity] = useState(100)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [dropdownOpen, setDropdownOpen] = useState<'texture' | 'blend' | null>(null)

  const textureOptions = [
    'magazine.jpg',
    'vinyl-bleed.jpg',
    '60s-mustard.jpg',
    'royal-navy.jpg',
    'tonor.png',
    'heavy-grain.png',
  ]

  const blendOptions = [
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

  const handleDownload = () => {
    if (!canvasRef.current || !photo) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tempTexture = new Image()
    tempTexture.src = `/textures/${textureSrc}`

    tempTexture.onload = () => {
      canvas.width = photo.width
      canvas.height = photo.height

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height)

      ctx.globalAlpha = opacity / 100
      ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation
      ctx.drawImage(tempTexture, 0, 0, canvas.width, canvas.height)

      const link = document.createElement('a')
      link.download = 'blended-image.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    }
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
                      setter(opt)
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
            <img
  key={textureSrc} // ✅ Add this line
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
          Download Image
        </button>
      </div>
    </main>
  )
}
