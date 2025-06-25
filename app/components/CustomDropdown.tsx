'use client'

import { useState, useRef, useEffect } from 'react'

type Option = { value: string; label: string }

export default function CustomDropdown({
  options,
  value,
  onChange,
  label,
}: {
  options: Option[]
  value: string
  onChange: (val: string) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      onMouseLeave={() => setOpen(false)}
      className="relative w-[180px]"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full h-[40px] bg-red-600 text-white font-mono border border-red-700 hover:bg-red-700 flex justify-between items-center px-3"
      >
        {value}
        <span className="ml-2">▼</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 w-full z-50 mt-1 bg-white border border-red-700 shadow-md">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-1 font-mono text-sm hover:bg-red-100 ${
                value === opt.value ? 'bg-red-200' : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
