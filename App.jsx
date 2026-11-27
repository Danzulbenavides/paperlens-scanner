import { useEffect, useMemo, useRef, useState } from 'react'
import AppSidebar from './components/layout/AppSidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import Icon from './components/layout/Icon.jsx'
import ScannerStage from './components/scanner/ScannerStage.jsx'
import { canvasToJpeg, createScannedCanvas, detectDocumentCorners, loadImage, resizeDataUrl } from './utils/imageProcessing.js'
import { createPdfBlob } from './utils/pdf.js'

const FILTERS = [
  { id: 'clean', label: 'Clean', description: 'Bright, crisp paper', swatch: 'swatch-clean' },
  { id: 'color', label: 'Color', description: 'Vivid original colors', swatch: 'swatch-color' },
  { id: 'grayscale', label: 'Grayscale', description: 'Neutral gray tones', swatch: 'swatch-gray' },
  { id: 'bw', label: 'Black & white', description: 'High-contrast text', swatch: 'swatch-bw' },
  { id: 'original', label: 'Original', description: 'No adjustments', swatch: 'swatch-original' },
]

const HISTORY_KEY = 'paperlens.recent.v1'

function readHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function safeFilename(value) {
  return (value || 'paperlens-scan').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-') || 'paperlens-scan'
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

function dataUrlBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
  const raw = atob(encoded)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

export default function App() {
  const [activeView, setActiveView] = useState('scanner')
  const [source, setSource] = useState(null)
  const [corners, setCorners] = useState([])
  const [detected, setDetected] = useState(false)
  const [filter, setFilter] = useState('clean')
  const [processedUrl, setProcessedUrl] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processError, setProcessError] = useState('')
  const [isLoadingImage, setIsLoadingImage] = useState(false)
  const [pages, setPages] = useState([])
  const [history, setHistory] = useState(readHistory)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [draggingFile, setDraggingFile] = useState(false)
  const [documentName, setDocumentName] = useState('Untitled document')
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const toastTimerRef = useRef(null)
  const processedCanvasRef = useRef(null)

  const allPageCount = pages.length + (source && processedUrl && !isProcessing ? 1 : 0)
  const activeFilter = useMemo(() => FILTERS.find((item) => item.id === filter) || FILTERS[0], [filter])

  function notify(message) {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200)
  }

  function clearCurrentImage() {
    setSource(null)
    setCorners([])
    setProcessedUrl('')
    setIsProcessing(false)
    setProcessError('')
    processedCanvasRef.current = null
    setDetected(false)
    setFilter('clean')
    setDocumentName('Untitled document')
  }

  async function loadSource(src, name = 'Untitled document') {
    setIsLoadingImage(true)
    try {
      const image = await loadImage(src)
      const detection = detectDocumentCorners(image)
      setSource({ src, image, name })
      setCorners(detection.corners)
      setDetected(detection.detected)
      setFilter('clean')
      setDocumentName(name.replace(/\.[^.]+$/, '') || 'Untitled document')
      setActiveView('scanner')
      if (detection.detected) notify('Document edges detected. Review the crop before exporting.')
      else notify('Image loaded. Adjust the corner handles to crop the page.')
    } catch (error) {
      notify(error.message || 'Unable to open this image.')
    } finally {
      setIsLoadingImage(false)
    }
  }

  async function handleFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('Choose an image file such as JPG, PNG, or WEBP.')
      return
    }
    if (file.size > 30 * 1024 * 1024) {
      notify('This image is larger than 30 MB. Choose a smaller photo.')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      await loadSource(String(reader.result), file.name)
    }
    reader.onerror = () => notify('The selected image could not be read.')
    reader.readAsDataURL(file)
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function handleDrop(event) {
    event.preventDefault()
    setDraggingFile(false)
    const file = event.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  useEffect(() => {
    if (!source || corners.length !== 4) {
      setProcessedUrl('')
      processedCanvasRef.current = null
      return undefined
    }
    let cancelled = false
    setIsProcessing(true)
    setProcessError('')
    setProcessedUrl('')
    const timeoutId = window.setTimeout(() => {
      try {
        const canvas = createScannedCanvas(source.image, corners, filter)
        if (cancelled) return
        processedCanvasRef.current = canvas
        setProcessedUrl(canvasToJpeg(canvas, 0.94))
      } catch (error) {
        if (!cancelled) {
          setProcessError(error.message || 'Could not process this crop. Try moving the corners.')
          notify(error.message || 'Could not process this crop. Try moving the corners.')
        }
      } finally {
        if (!cancelled) setIsProcessing(false)
      }
    }, 40)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [source, corners, filter])

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!isCameraOpen) return undefined
    let cancelled = false
    setCameraError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser. Open the app over HTTPS or use Upload photo instead.')
      return undefined
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setCameraError('Camera permission was blocked or no camera was found. Check your browser permissions, or upload a photo instead.'))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [isCameraOpen])

  async function capturePhoto() {
    const video = videoRef.current
    if (!video?.videoWidth) {
      notify('The camera is not ready yet.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.94))
    if (!blob) {
      notify('Could not capture the camera image.')
      return
    }
    const file = new File([blob], `PaperLens-${new Date().toISOString().slice(0, 10)}.jpg`, { type: 'image/jpeg' })
    setIsCameraOpen(false)
    await handleFile(file)
  }

  function addPage() {
    if (!processedUrl || isProcessing) return
    const page = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: documentName || `Page ${pages.length + 1}`, dataUrl: processedUrl }
    setPages((current) => [...current, page])
    clearCurrentImage()
    notify(`Page added. Your document now has ${pages.length + 1} page${pages.length === 0 ? '' : 's'}.`)
  }

  function addCurrentAndChooseNext() {
    if (processedUrl && !isProcessing) addPage()
    openFilePicker()
  }

  function runAutoDetect() {
    if (!source) return
    const detection = detectDocumentCorners(source.image)
    setCorners(detection.corners)
    setDetected(detection.detected)
    notify(detection.detected ? 'Document edges detected again.' : 'No clear page outline found. Adjust the crop handles manually.')
  }

  function removePage(id) {
    setPages((current) => current.filter((page) => page.id !== id))
  }

  async function persistHistory(dataUrl, name, pageCount = 1) {
    try {
      const preview = await resizeDataUrl(dataUrl, 520)
      const item = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: name || 'PaperLens scan',
        date: new Date().toISOString(),
        pageCount,
        preview,
      }
      const updated = [item, ...history.filter((entry) => entry.name !== item.name)].slice(0, 12)
      setHistory(updated)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
    } catch {
      notify('Your file was exported, but this scan could not be added to local history.')
    }
  }

  async function exportJpeg() {
    if (!processedUrl) return
    downloadBlob(dataUrlBlob(processedUrl), `${safeFilename(documentName)}.jpg`)
    await persistHistory(processedUrl, documentName, 1)
    notify('JPEG scan downloaded.')
  }

  async function exportPdf() {
    const documentPages = [
      ...pages,
      ...(source && processedUrl ? [{ id: 'current', name: documentName, dataUrl: processedUrl }] : []),
    ]
    if (!documentPages.length) {
      notify('Scan or add at least one page before exporting.')
      return
    }
    try {
      const blob = await createPdfBlob(documentPages)
      downloadBlob(blob, `${safeFilename(documentName)}.pdf`)
      const cover = documentPages[0].dataUrl
      await persistHistory(cover, documentName, documentPages.length)
      setPages([])
      clearCurrentImage()
      notify(`PDF exported with ${documentPages.length} page${documentPages.length === 1 ? '' : 's'}.`)
    } catch (error) {
      notify(error.message || 'PDF export failed. Please try again.')
    }
  }

  function openHistoryItem(item) {
    loadSource(item.preview, item.name)
  }

  function deleteHistoryItem(id) {
    const updated = history.filter((item) => item.id !== id)
    setHistory(updated)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)) } catch { /* Storage may be unavailable. */ }
    notify('Scan removed from recent history.')
  }

  function downloadHistoryItem(item) {
    downloadBlob(dataUrlBlob(item.preview), `${safeFilename(item.name)}.jpg`)
  }

  const displayRecent = history.slice(0, 3)

  return (
    <div className="app-shell">
      <AppSidebar activeView={activeView} onNavigate={setActiveView} recentCount={history.length} />
      <main className="main-area">
        <Topbar activeView={activeView} onOpenHelp={() => setHelpOpen(true)} />
        <div className="main-content">
          {activeView === 'recent' ? (
            <RecentView history={history} onOpen={openHistoryItem} onDownload={downloadHistoryItem} onDelete={deleteHistoryItem} onNew={() => setActiveView('scanner')} />
          ) : source ? (
            <>
              <div className="page-heading editor-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> DOCUMENT WORKSPACE</div>
                  <h1>Fine-tune your <span>scan.</span></h1>
                  <p>Check the detected edges, choose an enhancement, and export a clean copy.</p>
                </div>
                <div className="heading-actions">
                  <button className="button button-quiet" onClick={clearCurrentImage}><Icon name="close" size={16} /> Close scan</button>
                  <button className="button button-primary" onClick={addCurrentAndChooseNext} disabled={isProcessing}><Icon name="plus" size={17} /> Add another page</button>
                </div>
              </div>

              <div className="document-toolbar">
                <div className="document-name-wrap">
                  <div className="document-file-icon"><Icon name="file" size={18} /></div>
                  <div className="document-name-content">
                    <input value={documentName} onChange={(event) => setDocumentName(event.target.value)} aria-label="Document name" />
                    <span>{source.image.naturalWidth.toLocaleString()} × {source.image.naturalHeight.toLocaleString()} px · {detected ? 'Auto edges found' : 'Manual crop available'}</span>
                  </div>
                </div>
                <div className="document-toolbar-right">
                  <span className="saved-locally"><span /> Processing locally</span>
                  {pages.length > 0 && <span className="page-count-pill">{pages.length} page{pages.length === 1 ? '' : 's'} queued</span>}
                </div>
              </div>

              <ScannerStage image={source.image} corners={corners} onCornersChange={setCorners} outputUrl={processedUrl} busy={isProcessing} errorMessage={processError} detected={detected} onRedetect={runAutoDetect} />

              <section className="enhance-section">
                <div className="section-title-line">
                  <div><div className="section-kicker">MAKE IT CLEAR</div><h2>Enhancement</h2></div>
                  <span className="section-hint"><Icon name="sparkle" size={14} /> Preview updates automatically</span>
                </div>
                <div className="filter-grid">
                  {FILTERS.map((item) => (
                    <button key={item.id} className={`filter-option ${filter === item.id ? 'selected' : ''}`} onClick={() => setFilter(item.id)}>
                      <span className={`filter-swatch ${item.swatch}`}><span /></span>
                      <span className="filter-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                      {filter === item.id && <span className="filter-selected"><Icon name="check" size={12} /></span>}
                    </button>
                  ))}
                </div>
              </section>

              {pages.length > 0 && <QueuedPages pages={pages} onRemove={removePage} />}

              <div className="export-bar">
                <div className="export-explainer"><div className="export-icon"><Icon name="file-pdf" size={19} /></div><div><strong>Ready when you are</strong><span>{allPageCount} page{allPageCount === 1 ? '' : 's'} · {activeFilter.label} enhancement · PDF or JPEG</span></div></div>
                <div className="export-actions">
                  <button className="button button-outline" onClick={addPage} disabled={!processedUrl || isProcessing}><Icon name="plus" size={16} /> Add page</button>
                  <button className="button button-outline" onClick={exportJpeg} disabled={!processedUrl || isProcessing}><Icon name="image" size={16} /> JPEG</button>
                  <button className="button button-primary" onClick={exportPdf} disabled={(!processedUrl && pages.length === 0) || isProcessing}><Icon name="download" size={16} /> Export PDF</button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> YOUR DIGITAL SCANNER</div>
                  <h1>Paper in. <span>Perfect scans out.</span></h1>
                  <p>Turn everyday documents into clean, sharp digital files in just a few clicks.</p>
                </div>
                <div className="heading-note"><div className="heading-note-icon"><Icon name="shield" size={18} /></div><span>Private by design<br /><strong>Files stay on this device</strong></span></div>
              </div>

              {pages.length > 0 && <div className="queued-banner"><div className="queued-banner-icon"><Icon name="file-pdf" size={18} /></div><div><strong>{pages.length} page{pages.length === 1 ? '' : 's'} ready for your PDF</strong><span>Continue scanning or export your document.</span></div><button className="button button-primary button-small" onClick={exportPdf}><Icon name="download" size={15} /> Export PDF</button></div>}

              <div className="capture-layout">
                <section className={`capture-card ${draggingFile ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDraggingFile(true) }} onDragLeave={() => setDraggingFile(false)} onDrop={handleDrop}>
                  <div className="capture-card-top"><span className="capture-label"><span className="capture-dot" /> QUICK START</span><span className="file-types">JPG · PNG · WEBP</span></div>
                  <div className="capture-illustration">
                    <div className="illustration-glow" />
                    <div className="paper-sheet sheet-back"><span /><span /><span /></div>
                    <div className="paper-sheet sheet-front"><div className="paper-mini-mark" /><b /><span /><span /><span /><i /></div>
                    <div className="scan-corner scan-corner-tl" /><div className="scan-corner scan-corner-tr" /><div className="scan-corner scan-corner-bl" /><div className="scan-corner scan-corner-br" />
                    <div className="sparkle-dot sparkle-one">✦</div><div className="sparkle-dot sparkle-two">✧</div>
                  </div>
                  <div className="capture-copy">
                    <h2>Start with a document</h2>
                    <p>Take a photo or choose an image from your device. PaperLens will find the page edges and straighten it for you.</p>
                  </div>
                  <div className="capture-actions">
                    <button className="button button-primary button-large" onClick={openFilePicker}><Icon name="upload" size={18} /> Upload a photo</button>
                    <button className="button button-outline button-large" onClick={() => setIsCameraOpen(true)}><Icon name="camera" size={18} /> Use camera</button>
                  </div>
                  <div className="drop-hint"><Icon name="folder" size={15} /> or drag and drop an image here</div>
                </section>

                <aside className="capture-aside">
                  <div className="aside-card tips-card">
                    <div className="aside-title"><span className="aside-title-icon"><Icon name="sparkle" size={16} /></span><h3>Tips for a great scan</h3></div>
                    <div className="tip-row"><span className="tip-number">01</span><div><strong>Use a flat surface</strong><p>Place your paper on a surface with a contrasting color.</p></div></div>
                    <div className="tip-row"><span className="tip-number">02</span><div><strong>Keep the light even</strong><p>Avoid strong shadows, glare, and very dim rooms.</p></div></div>
                    <div className="tip-row"><span className="tip-number">03</span><div><strong>Fit the whole page</strong><p>Keep all four document corners visible in your photo.</p></div></div>
                  </div>
                  <div className="aside-card workflow-card">
                    <div className="workflow-top"><span className="workflow-icon"><Icon name="scan" size={17} /></span><span className="workflow-label">THE WORKFLOW</span></div>
                    <div className="workflow-steps"><span>Capture</span><i /><span>Enhance</span><i /><span>Export</span></div>
                    <p>From paper to PDF, without the busywork.</p>
                  </div>
                </aside>
              </div>

              {displayRecent.length > 0 && <section className="recent-preview"><div className="recent-preview-heading"><div><div className="section-kicker">PICK UP WHERE YOU LEFT OFF</div><h2>Recent scans</h2></div><button className="text-button" onClick={() => setActiveView('recent')}>View all <Icon name="chevron" size={14} /></button></div><div className="recent-mini-grid">{displayRecent.map((item) => <RecentMiniCard key={item.id} item={item} onOpen={openHistoryItem} />)}</div></section>}
            </>
          )}
        </div>
        <footer className="main-footer"><span>© 2026 PaperLens</span><span><Icon name="shield" size={13} /> Your documents never leave your browser</span><span>Built for clearer paperwork.</span></footer>
      </main>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) handleFile(file); event.target.value = '' }} />

      {isLoadingImage && <div className="loading-scrim"><div className="loading-card"><span className="spinner" /><strong>Preparing your document</strong><p>Finding the page edges…</p></div></div>}

      {isCameraOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCameraOpen(false) }}><section className="camera-modal" role="dialog" aria-modal="true" aria-labelledby="camera-title"><div className="modal-heading"><div><span className="modal-eyebrow">LIVE CAMERA</span><h2 id="camera-title">Capture a document</h2></div><button className="icon-button" onClick={() => setIsCameraOpen(false)} aria-label="Close camera"><Icon name="close" size={19} /></button></div><div className="camera-view">{cameraError ? <div className="camera-error"><Icon name="camera" size={30} /><p>{cameraError}</p></div> : <video ref={videoRef} autoPlay playsInline muted />}</div><div className="camera-guidance"><Icon name="lightbulb" size={16} /> Keep all four paper corners inside the frame and avoid shadows.</div><div className="camera-modal-actions"><button className="button button-outline" onClick={() => setIsCameraOpen(false)}>Cancel</button><button className="button button-primary" onClick={capturePhoto} disabled={Boolean(cameraError)}><Icon name="camera" size={17} /> Capture photo</button></div></section></div>}

      {helpOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false) }}><section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="modal-heading"><div><span className="modal-eyebrow">PAPERLENS GUIDE</span><h2 id="help-title">A clearer scan in three steps</h2></div><button className="icon-button" onClick={() => setHelpOpen(false)} aria-label="Close help"><Icon name="close" size={19} /></button></div><div className="help-step"><span>01</span><div><strong>Capture or upload</strong><p>Use your camera or choose a JPG, PNG, or WEBP image.</p></div></div><div className="help-step"><span>02</span><div><strong>Check your crop</strong><p>PaperLens looks for the page outline. Drag any of the four corner handles if it needs adjusting.</p></div></div><div className="help-step"><span>03</span><div><strong>Enhance and export</strong><p>Choose a filter, add more pages when needed, then download a PDF or JPEG.</p></div></div><div className="help-note"><Icon name="shield" size={16} /> Image processing and recent scan history are stored locally in this browser.</div><button className="button button-primary help-done" onClick={() => setHelpOpen(false)}>Got it</button></section></div>}

      {toast && <div className="toast-message"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}
    </div>
  )
}

function QueuedPages({ pages, onRemove }) {
  return (
    <section className="queued-pages-section">
      <div className="queued-heading"><div><div className="section-kicker">MULTI-PAGE DOCUMENT</div><h2>Pages in this PDF <span>{pages.length}</span></h2></div><p>These pages will be combined in order.</p></div>
      <div className="queued-page-list">{pages.map((page, index) => <div className="queued-page" key={page.id}><div className="queued-thumb"><img src={page.dataUrl} alt={`Page ${index + 1}`} /></div><div className="queued-page-meta"><strong>Page {index + 1}</strong><span>{page.name}</span></div><button className="icon-button remove-page" onClick={() => onRemove(page.id)} aria-label={`Remove page ${index + 1}`}><Icon name="trash" size={16} /></button></div>)}</div>
    </section>
  )
}

function RecentMiniCard({ item, onOpen }) {
  return <button className="recent-mini-card" onClick={() => onOpen(item)}><div className="recent-mini-thumb"><img src={item.preview} alt="" /></div><div className="recent-mini-meta"><strong>{item.name}</strong><span>{new Date(item.date).toLocaleDateString()} · {item.pageCount} page{item.pageCount === 1 ? '' : 's'}</span></div><Icon name="chevron" size={16} /></button>
}

function RecentView({ history, onOpen, onDownload, onDelete, onNew }) {
  return (
    <div className="recent-view">
      <div className="page-heading recent-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR LIBRARY</div><h1>Your recent <span>scans.</span></h1><p>Scans you've exported from this browser are saved here for quick access.</p></div><button className="button button-primary" onClick={onNew}><Icon name="plus" size={17} /> New scan</button></div>
      {history.length === 0 ? <div className="empty-library"><div className="empty-icon"><Icon name="file" size={28} /></div><h2>No scans yet</h2><p>Your exported documents will appear here. Start by uploading a photo or capturing one with your camera.</p><button className="button button-primary" onClick={onNew}><Icon name="scan" size={17} /> Start scanning</button></div> : <div className="history-grid">{history.map((item) => <article className="history-card" key={item.id}><button className="history-preview" onClick={() => onOpen(item)}><img src={item.preview} alt={`Preview of ${item.name}`} /><span className="history-open-label">Open scan <Icon name="chevron" size={14} /></span></button><div className="history-card-meta"><div><strong>{item.name}</strong><span>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {item.pageCount} page{item.pageCount === 1 ? '' : 's'}</span></div><div className="history-card-actions"><button className="icon-button" onClick={() => onDownload(item)} aria-label="Download scan"><Icon name="download" size={16} /></button><button className="icon-button" onClick={() => onDelete(item.id)} aria-label="Delete from history"><Icon name="trash" size={16} /></button></div></div></article>)}</div>}
      <div className="history-disclaimer"><Icon name="shield" size={15} /> Recent scans are stored in this browser's local storage as reduced-size previews. Export the original scan for full resolution.</div>
    </div>
  )
}
