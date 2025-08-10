// Remove this entire function from your code:

// Convert a canvas to an <img> so Safari applies ctx.filter correctly
async function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    // Prefer toBlob for memory; fall back to dataURL if needed
    canvas.toBlob((blob) => {
      if (!blob) {
        try {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = canvas.toDataURL('image/png')
        } catch (e) {
          reject(e)
        }
        return
      }
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = (e) => {
        URL.revokeObjectURL(url)
        reject(e)
      }
      img.src = url
    }, 'image/png')
  })
}