import Icon from './Icon.jsx'

export default function AppSidebar({ activeView, onNavigate, recentCount }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><Icon name="scan" size={22} strokeWidth={2.1} /></div>
        <div>
          <div className="brand-name">paperlens</div>
          <div className="brand-caption">DOCUMENT STUDIO</div>
        </div>
      </div>

      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={`nav-item ${activeView === 'scanner' ? 'active' : ''}`} onClick={() => onNavigate('scanner')}>
          <Icon name="scan" size={18} />
          <span>New scan</span>
          <span className="nav-shortcut">N</span>
        </button>
        <button className={`nav-item ${activeView === 'recent' ? 'active' : ''}`} onClick={() => onNavigate('recent')}>
          <Icon name="recent" size={18} />
          <span>Recent scans</span>
          {recentCount > 0 && <span className="nav-count">{recentCount}</span>}
        </button>
      </nav>

      <div className="sidebar-divider" />
      <div className="sidebar-section-label">QUICK TOOLS</div>
      <div className="quick-tool"><span className="quick-tool-icon violet"><Icon name="image" size={16} /></span><span>Image to PDF</span></div>
      <div className="quick-tool"><span className="quick-tool-icon amber"><Icon name="crop" size={16} /></span><span>Perspective crop</span></div>
      <div className="quick-tool"><span className="quick-tool-icon mint"><Icon name="sparkle" size={16} /></span><span>Smart enhance</span></div>

      <div className="sidebar-spacer" />
      <div className="privacy-card">
        <div className="privacy-icon"><Icon name="shield" size={18} /></div>
        <div className="privacy-title">Your files stay yours</div>
        <p>Scans are processed in your browser. Nothing is uploaded to a server.</p>
        <div className="privacy-status"><span /> ON-DEVICE PROCESSING</div>
      </div>
      <div className="sidebar-footer"><span className="status-dot" /> PaperLens <span>v1.0</span></div>
    </aside>
  )
}
