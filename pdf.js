function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function getJpegSize(bytes) {
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.length) break
    const segmentLength = (bytes[offset] << 8) + bytes[offset + 1]
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 3] << 8) + bytes[offset + 4],
        width: (bytes[offset + 5] << 8) + bytes[offset + 6],
      }
    }
    offset += segmentLength
  }
  throw new Error('A scanned page is not a supported JPEG image.')
}

export async function createPdfBlob(pages) {
  if (!pages.length) throw new Error('Add at least one scanned page before exporting a PDF.')
  const pageImages = pages.map((page) => {
    const bytes = dataUrlToBytes(page.dataUrl)
    return { bytes, ...getJpegSize(bytes) }
  })
  const objects = []
  const pageObjectIds = pageImages.map((_, index) => 3 + index * 3)
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Count ${pageImages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`)
  pageImages.forEach((image, index) => {
    const pageId = pageObjectIds[index]
    const contentId = pageId + 1
    const imageId = pageId + 2
    const pageWidth = 595.28
    const pageHeight = 841.89
    const scale = Math.min(pageWidth / image.width, pageHeight / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const offsetX = (pageWidth - drawWidth) / 2
    const offsetY = (pageHeight - drawHeight) / 2
    const stream = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm\n/Im0 Do\nQ`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    objects.push({
      prefix: `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      bytes: image.bytes,
      suffix: '\nendstream',
    })
  })

  const encoder = new TextEncoder()
  const chunks = []
  let byteOffset = 0
  const offsets = [0]
  const append = (chunk) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    chunks.push(bytes)
    byteOffset += bytes.length
  }
  append('%PDF-1.4\n%PaperLens\n')
  objects.forEach((object, index) => {
    offsets.push(byteOffset)
    append(`${index + 1} 0 obj\n`)
    if (typeof object === 'string') append(object)
    else {
      append(object.prefix)
      append(object.bytes)
      append(object.suffix)
    }
    append('\nendobj\n')
  })
  const xrefOffset = byteOffset
  append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`)
  offsets.slice(1).forEach((offset) => append(`${String(offset).padStart(10, '0')} 00000 n \n`))
  append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  return new Blob(chunks, { type: 'application/pdf' })
}
