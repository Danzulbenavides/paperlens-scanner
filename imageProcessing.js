const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This image could not be opened. Try another JPG or PNG file.'))
    image.src = src
  })
}

function lineIntersection(first, second) {
  const determinant = first.a * second.b - second.a * first.b
  if (Math.abs(determinant) < 1e-5) return null
  return {
    x: (first.rho * second.b - second.rho * first.b) / determinant,
    y: (first.a * second.rho - second.a * first.rho) / determinant,
  }
}

function polygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area / 2)
}

function isConvex(points) {
  let sign = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    const c = points[(index + 2) % points.length]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 2) return false
    const nextSign = Math.sign(cross)
    if (sign && sign !== nextSign) return false
    sign = nextSign
  }
  return true
}

function orderCorners(points) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 })
  const ordered = [...points].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x))
  let topLeftIndex = 0
  let smallest = Number.POSITIVE_INFINITY
  ordered.forEach((point, index) => {
    const score = point.x + point.y
    if (score < smallest) {
      smallest = score
      topLeftIndex = index
    }
  })
  return ordered.map((_, index) => ordered[(topLeftIndex + index) % 4])
}

function findHoughLines(width, height, gray) {
  const magnitudes = new Uint8Array(width * height)
  const nonzero = []
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = y * width + x
      const gx = -gray[offset - width - 1] - 2 * gray[offset - 1] - gray[offset + width - 1]
        + gray[offset - width + 1] + 2 * gray[offset + 1] + gray[offset + width + 1]
      const gy = -gray[offset - width - 1] - 2 * gray[offset - width] - gray[offset - width + 1]
        + gray[offset + width - 1] + 2 * gray[offset + width] + gray[offset + width + 1]
      const magnitude = Math.min(255, Math.round(Math.hypot(gx, gy) / 4))
      magnitudes[offset] = magnitude
      if (magnitude > 0) nonzero.push(magnitude)
    }
  }
  if (nonzero.length < 100) return []
  nonzero.sort((a, b) => a - b)
  const threshold = Math.max(24, nonzero[Math.floor(nonzero.length * 0.74)])
  const edgePoints = []
  const sampleStep = Math.max(1, Math.ceil((width * height) / 180000))
  for (let index = 0; index < magnitudes.length; index += sampleStep) {
    if (magnitudes[index] >= threshold) edgePoints.push({ x: index % width, y: Math.floor(index / width) })
  }
  if (edgePoints.length < 80) return []

  const angleCount = 180
  const rhoLimit = Math.ceil(Math.hypot(width, height))
  const rhoSize = rhoLimit * 2 + 1
  const accumulator = new Uint16Array(angleCount * rhoSize)
  const cosines = new Float32Array(angleCount)
  const sines = new Float32Array(angleCount)
  for (let angle = 0; angle < angleCount; angle += 1) {
    const radians = (angle * Math.PI) / 180
    cosines[angle] = Math.cos(radians)
    sines[angle] = Math.sin(radians)
  }
  edgePoints.forEach(({ x, y }) => {
    for (let angle = 0; angle < angleCount; angle += 1) {
      const rho = Math.round(x * cosines[angle] + y * sines[angle]) + rhoLimit
      accumulator[angle * rhoSize + rho] += 1
    }
  })
  let maximum = 0
  for (let index = 0; index < accumulator.length; index += 1) maximum = Math.max(maximum, accumulator[index])
  const minimumVotes = Math.max(18, Math.round(maximum * 0.2))
  const peaks = []
  for (let angle = 0; angle < angleCount; angle += 1) {
    for (let rhoIndex = 3; rhoIndex < rhoSize - 3; rhoIndex += 1) {
      const votes = accumulator[angle * rhoSize + rhoIndex]
      if (votes < minimumVotes) continue
      let isPeak = true
      for (let angleOffset = -2; angleOffset <= 2 && isPeak; angleOffset += 1) {
        for (let rhoOffset = -3; rhoOffset <= 3; rhoOffset += 1) {
          if (angleOffset === 0 && rhoOffset === 0) continue
          const neighborAngle = (angle + angleOffset + angleCount) % angleCount
          const neighbor = accumulator[neighborAngle * rhoSize + rhoIndex + rhoOffset]
          if (neighbor > votes) {
            isPeak = false
            break
          }
        }
      }
      if (isPeak) {
        peaks.push({
          angle,
          rho: rhoIndex - rhoLimit,
          votes,
          a: cosines[angle],
          b: sines[angle],
        })
      }
    }
  }
  peaks.sort((a, b) => b.votes - a.votes)
  const selected = []
  for (const line of peaks) {
    const duplicate = selected.some((other) => {
      let angleDifference = Math.abs(line.angle - other.angle)
      angleDifference = Math.min(angleDifference, 180 - angleDifference)
      return angleDifference < 8 && Math.abs(line.rho - other.rho) < 22
    })
    if (!duplicate) selected.push(line)
    if (selected.length === 18) break
  }
  return selected
}


function detectByBackgroundDifference(width, height, pixels, originalWidth, originalHeight) {
  const borderBand = Math.max(5, Math.round(Math.min(width, height) * 0.035))
  const borderSamples = [[], [], []]
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (x >= borderBand && x < width - borderBand && y >= borderBand && y < height - borderBand) continue
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) borderSamples[channel].push(pixels[offset + channel])
    }
  }
  if (!borderSamples[0].length) return null
  const background = borderSamples.map((samples) => {
    samples.sort((a, b) => a - b)
    return samples[Math.floor(samples.length / 2)]
  })
  const mask = new Uint8Array(width * height)
  let maskCount = 0
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4
    const distance = Math.hypot(
      pixels[offset] - background[0],
      pixels[offset + 1] - background[1],
      pixels[offset + 2] - background[2],
    )
    if (distance > 42) {
      mask[index] = 1
      maskCount += 1
    }
  }
  if (maskCount < width * height * 0.08) return null

  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let best = null
  let bestCount = 0
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    let minSum = null
    let maxDiff = null
    let maxSum = null
    let minDiff = null
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    while (head < tail) {
      const pixel = queue[head++]
      const x = pixel % width
      const y = Math.floor(pixel / width)
      const sum = x + y
      const diff = x - y
      if (!minSum || sum < minSum.score) minSum = { score: sum, x, y }
      if (!maxDiff || diff > maxDiff.score) maxDiff = { score: diff, x, y }
      if (!maxSum || sum > maxSum.score) maxSum = { score: sum, x, y }
      if (!minDiff || diff < minDiff.score) minDiff = { score: diff, x, y }
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const neighbor = ny * width + nx
          if (mask[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1
            queue[tail++] = neighbor
          }
        }
      }
    }
    if (tail > bestCount && (maxX - minX) > width * 0.2 && (maxY - minY) > height * 0.2) {
      bestCount = tail
      best = { corners: [minSum, maxDiff, maxSum, minDiff], minX, minY, maxX, maxY }
    }
  }
  if (!best || bestCount < width * height * 0.09) return null
  const corners = orderCorners(best.corners.map(({ x, y }) => ({ x, y })))
  const areaRatio = polygonArea(corners) / (width * height)
  if (areaRatio < 0.1 || areaRatio > 0.97 || !isConvex(corners)) return null
  const sideLengths = corners.map((point, index) => Math.hypot(
    corners[(index + 1) % 4].x - point.x,
    corners[(index + 1) % 4].y - point.y,
  ))
  if (Math.min(...sideLengths) < Math.min(width, height) * 0.18) return null
  return corners.map((point) => ({
    x: clamp((point.x / width) * originalWidth, 0, originalWidth),
    y: clamp((point.y / height) * originalHeight, 0, originalHeight),
  }))
}

export function detectDocumentCorners(image) {
  const scale = Math.min(1, 560 / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(80, Math.round(image.naturalWidth * scale))
  const height = Math.max(80, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  const segmented = detectByBackgroundDifference(width, height, pixels, image.naturalWidth, image.naturalHeight)
  if (segmented) return { corners: segmented, detected: true }
  const gray = new Uint8Array(width * height)
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4
    gray[index] = Math.round(pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114)
  }
  const lines = findHoughLines(width, height, gray)
  let best = null
  let bestScore = 0
  const minArea = width * height * 0.2
  const maxArea = width * height * 0.985
  const cycles = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3]]
  for (let a = 0; a < lines.length - 3; a += 1) {
    for (let b = a + 1; b < lines.length - 2; b += 1) {
      for (let c = b + 1; c < lines.length - 1; c += 1) {
        for (let d = c + 1; d < lines.length; d += 1) {
          const group = [lines[a], lines[b], lines[c], lines[d]]
          for (const cycle of cycles) {
            const orderedLines = cycle.map((index) => group[index])
            const corners = orderedLines.map((line, index) => lineIntersection(line, orderedLines[(index + 1) % 4]))
            if (corners.some((point) => !point)) continue
            if (corners.some((point) => point.x < -width * 0.07 || point.x > width * 1.07 || point.y < -height * 0.07 || point.y > height * 1.07)) continue
            const polygon = orderCorners(corners)
            if (!isConvex(polygon)) continue
            const area = polygonArea(polygon)
            if (area < minArea || area > maxArea) continue
            const sideLengths = polygon.map((point, index) => {
              const next = polygon[(index + 1) % 4]
              return Math.hypot(next.x - point.x, next.y - point.y)
            })
            if (Math.min(...sideLengths) < Math.min(width, height) * 0.17) continue
            const aspectOne = sideLengths[0] / Math.max(sideLengths[2], 1)
            const aspectTwo = sideLengths[1] / Math.max(sideLengths[3], 1)
            if (aspectOne < 0.45 || aspectOne > 2.2 || aspectTwo < 0.45 || aspectTwo > 2.2) continue
            const lineStrength = group.reduce((sum, line) => sum + line.votes, 0)
            const areaRatio = area / (width * height)
            const score = lineStrength * (0.3 + areaRatio * 1.8)
            if (score > bestScore) {
              bestScore = score
              best = polygon.map((point) => ({
                x: clamp((point.x / width) * image.naturalWidth, 0, image.naturalWidth),
                y: clamp((point.y / height) * image.naturalHeight, 0, image.naturalHeight),
              }))
            }
          }
        }
      }
    }
  }
  if (best) return { corners: best, detected: true }
  const marginX = image.naturalWidth * 0.025
  const marginY = image.naturalHeight * 0.025
  return {
    detected: false,
    corners: [
      { x: marginX, y: marginY },
      { x: image.naturalWidth - marginX, y: marginY },
      { x: image.naturalWidth - marginX, y: image.naturalHeight - marginY },
      { x: marginX, y: image.naturalHeight - marginY },
    ],
  }
}

function solveLinearSystem(matrix, values) {
  const size = values.length
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) throw new Error('The selected crop corners overlap. Move the handles and try again.')
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let cell = column; cell <= size; cell += 1) augmented[column][cell] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let cell = column; cell <= size; cell += 1) augmented[row][cell] -= factor * augmented[column][cell]
    }
  }
  return augmented.map((row) => row[size])
}

function perspectiveTransform(sourceCanvas, corners) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners
  const outputWidth = Math.round(Math.max(
    Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
    Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
  ))
  const outputHeight = Math.round(Math.max(
    Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
    Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y),
  ))
  const outputScale = Math.min(1, 5000 / Math.max(outputWidth, outputHeight), Math.sqrt(24000000 / Math.max(1, outputWidth * outputHeight)))
  const width = clamp(Math.round(outputWidth * outputScale), 240, 5000)
  const height = clamp(Math.round(outputHeight * outputScale), 240, 5000)
  const destination = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  const matrix = []
  const values = []
  destination.forEach((point, index) => {
    const source = corners[index]
    matrix.push([point.x, point.y, 1, 0, 0, 0, -point.x * source.x, -point.y * source.x])
    values.push(source.x)
    matrix.push([0, 0, 0, point.x, point.y, 1, -point.x * source.y, -point.y * source.y])
    values.push(source.y)
  })
  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, values)
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  const sourcePixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = width
  outputCanvas.height = height
  const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true })
  const output = outputContext.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denominator = g * x + h * y + 1
      const sourceX = clamp((a * x + b * y + c) / denominator, 0, sourceCanvas.width - 1.001)
      const sourceY = clamp((d * x + e * y + f) / denominator, 0, sourceCanvas.height - 1.001)
      const x0 = Math.floor(sourceX)
      const y0 = Math.floor(sourceY)
      const x1 = Math.min(x0 + 1, sourceCanvas.width - 1)
      const y1 = Math.min(y0 + 1, sourceCanvas.height - 1)
      const dx = sourceX - x0
      const dy = sourceY - y0
      const destinationOffset = (y * width + x) * 4
      const topLeftOffset = (y0 * sourceCanvas.width + x0) * 4
      const topRightOffset = (y0 * sourceCanvas.width + x1) * 4
      const bottomLeftOffset = (y1 * sourceCanvas.width + x0) * 4
      const bottomRightOffset = (y1 * sourceCanvas.width + x1) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const top = sourcePixels[topLeftOffset + channel] * (1 - dx) + sourcePixels[topRightOffset + channel] * dx
        const bottom = sourcePixels[bottomLeftOffset + channel] * (1 - dx) + sourcePixels[bottomRightOffset + channel] * dx
        output.data[destinationOffset + channel] = Math.round(top * (1 - dy) + bottom * dy)
      }
      output.data[destinationOffset + 3] = 255
    }
  }
  outputContext.putImageData(output, 0, 0)
  return outputCanvas
}

function otsuThreshold(histogram, pixelCount) {
  let totalSum = 0
  for (let index = 0; index < 256; index += 1) totalSum += index * histogram[index]
  let backgroundSum = 0
  let backgroundWeight = 0
  let maximumVariance = 0
  let threshold = 150
  for (let index = 0; index < 256; index += 1) {
    backgroundWeight += histogram[index]
    if (!backgroundWeight) continue
    const foregroundWeight = pixelCount - backgroundWeight
    if (!foregroundWeight) break
    backgroundSum += index * histogram[index]
    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean = (totalSum - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2
    if (variance > maximumVariance) {
      maximumVariance = variance
      threshold = index
    }
  }
  return threshold
}

function enhanceCanvas(canvas, filter) {
  if (filter === 'original') return canvas
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  const histogram = new Uint32Array(256)
  if (filter === 'bw') {
    for (let index = 0; index < data.length; index += 4) {
      const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114)
      histogram[gray] += 1
    }
  }
  const threshold = filter === 'bw' ? otsuThreshold(histogram, canvas.width * canvas.height) : 0
  for (let index = 0; index < data.length; index += 4) {
    let red = data[index]
    let green = data[index + 1]
    let blue = data[index + 2]
    if (filter === 'grayscale' || filter === 'bw') {
      const gray = Math.round(red * 0.299 + green * 0.587 + blue * 0.114)
      const value = filter === 'bw' ? (gray > threshold ? 255 : 0) : gray
      red = value
      green = value
      blue = value
    } else if (filter === 'clean') {
      red = clamp((red - 128) * 1.18 + 133, 0, 255)
      green = clamp((green - 128) * 1.18 + 133, 0, 255)
      blue = clamp((blue - 128) * 1.18 + 133, 0, 255)
    } else if (filter === 'color') {
      const gray = red * 0.299 + green * 0.587 + blue * 0.114
      red = clamp(gray + (red - gray) * 1.24, 0, 255)
      green = clamp(gray + (green - gray) * 1.24, 0, 255)
      blue = clamp(gray + (blue - gray) * 1.24, 0, 255)
    }
    data[index] = red
    data[index + 1] = green
    data[index + 2] = blue
  }
  context.putImageData(imageData, 0, 0)
  return canvas
}

export function createScannedCanvas(image, corners, filter = 'clean') {
  const sourceScale = Math.min(1, 5000 / Math.max(image.naturalWidth, image.naturalHeight))
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = Math.round(image.naturalWidth * sourceScale)
  sourceCanvas.height = Math.round(image.naturalHeight * sourceScale)
  sourceCanvas.getContext('2d').drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height)
  const scaledCorners = corners.map((point) => ({ x: point.x * sourceScale, y: point.y * sourceScale }))
  const warped = perspectiveTransform(sourceCanvas, scaledCorners)
  return enhanceCanvas(warped, filter)
}

export function canvasToJpeg(canvas, quality = 0.94) {
  return canvas.toDataURL('image/jpeg', quality)
}

export function resizeDataUrl(dataUrl, maxWidth = 480) {
  return loadImage(dataUrl).then((image) => {
    const scale = Math.min(1, maxWidth / image.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  })
}
