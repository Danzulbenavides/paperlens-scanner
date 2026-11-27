import { useState } from 'react'
import Icon from './Icon.jsx'

export default function ScannerStage({ image, corners, onCornersChange, outputUrl, busy, errorMessage, detected, onRedetect }) {
  const [dragging, setDragging] = useState(null)

  function moveCorner(event) {
    if (dragging === null || !image) return
    const svg = event.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = Math.max(0, Math.min(image.naturalWidth, ((event.clientX - rect.left) / rect.width) * image.naturalWidth))
    const y = Math.max(0, Math.min(image.naturalHeight, ((event.clientY - rect.top) / rect.height) * image.naturalHeight))
    const next = corners.map((point, index) => index === dragging ? { x, y } : point)
    onCornersChange(next)
  }

  function startDrag(event, index) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
    setDragging(index)
  }

  return (
    <div className="stage-grid">
      <section className="stage-card source-card">
        <div className="stage-card-heading">
          <div><span className="step-number">01</span><div><h3>Adjust document edges</h3><p>Drag the corner handles to fine-tune the crop</p></div></div>
          <button className="stage-tag stage-redetect" onClick={onRedetect} title="Try automatic edge detection again"><Icon name="refresh" size={13} /> AUTO DETECT</button>
        </div>
        <div className="source-frame-wrap">
          <div className="source-frame" style={{ aspectRatio: `${image.naturalWidth} / ${image.naturalHeight}`, width: `min(100%, ${Math.round(470 * image.naturalWidth / image.naturalHeight)}px)` }}>
            <img src={image.src} alt="Original document" draggable="false" />
            <svg
              className="crop-overlay"
              viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`}
              preserveAspectRatio="none"
              onPointerMove={moveCorner}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
            >
              <polygon points={corners.map((point) => `${point.x},${point.y}`).join(' ')} />
              {corners.map((point, index) => (
                <g key={index} className="corner-handle" onPointerDown={(event) => startDrag(event, index)}>
                  <circle className="handle-hit-area" cx={point.x} cy={point.y} r={Math.max(image.naturalWidth, image.naturalHeight) * 0.035} />
                  <circle className="handle-dot" cx={point.x} cy={point.y} r={Math.max(image.naturalWidth, image.naturalHeight) * 0.011} />
                </g>
              ))}
            </svg>
          </div>
        </div>
        <div className="stage-footnote"><span className="footnote-dot" /> {detected ? 'Page edges detected automatically' : 'Default crop set · Move the handles to outline your page'} · Drag any handle to adjust</div>
      </section>

      <section className="stage-card output-card">
        <div className="stage-card-heading">
          <div><span className="step-number step-violet">02</span><div><h3>Scan preview</h3><p>Your corrected, enhanced document</p></div></div>
          <span className="stage-tag stage-tag-violet"><Icon name="sparkle" size={13} /> LIVE</span>
        </div>
        <div className="output-frame">
          {errorMessage ? (
            <div className="processing-state processing-error"><strong>Crop needs attention</strong><p>{errorMessage}</p></div>
          ) : busy || !outputUrl ? (
            <div className="processing-state"><span className="spinner" /><p>Preparing your scan…</p></div>
          ) : (
            <img src={outputUrl} alt="Enhanced document preview" />
          )}
        </div>
        <div className="stage-footnote"><Icon name="check" size={14} /> Perspective corrected · Ready to export</div>
      </section>
    </div>
  )
}
