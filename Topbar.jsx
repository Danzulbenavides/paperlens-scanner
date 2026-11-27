import Icon from './Icon.jsx'

export default function Topbar({ activeView, onOpenHelp }) {
  return (
    <header className="topbar">
      <div className="breadcrumb-line">
        <span>PaperLens</span>
        <Icon name="chevron" size={14} />
        <strong>{activeView === 'recent' ? 'Recent scans' : 'Document scanner'}</strong>
      </div>
      <div className="topbar-actions">
        <span className="local-badge"><span /> Local & private</span>
        <button className="icon-button help-button" onClick={onOpenHelp} aria-label="Open help">?</button>
        <div className="profile-avatar">PL</div>
      </div>
    </header>
  )
}
