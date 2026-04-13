export default function LayerControls({ status, onToggle }) {
  const LAYERS = [
    { key: 'vessels',   label: 'Vessels',   icon: '🚢' },
    { key: 'aircraft',  label: 'Aircraft',  icon: '✈️'  },
    { key: 'conflicts', label: 'Conflicts', icon: '⚠️'  }
  ]

  return (
    <div className="layer-controls">
      {LAYERS.map(({ key, label, icon }) => {
        const s = status[key]
        const activeClass = s.visible ? `active-${key}` : ''

        return (
          <button
            key={key}
            className={`layer-btn ${activeClass}`}
            onClick={() => onToggle(key)}
            title={s.error ? `Error: ${s.error}` : `Toggle ${label} layer`}
          >
            <span className="layer-icon">{icon}</span>
            <span className="layer-label">{label}</span>

            {s.loading && (
              <span className="layer-badge badge-loading">…</span>
            )}
            {!s.loading && s.error && (
              <span className="layer-badge badge-error" title={s.error}>!</span>
            )}
            {!s.loading && !s.error && s.count > 0 && (
              <span className="layer-badge badge-count">
                {s.count > 9999 ? '9k+' : s.count > 999 ? `${(s.count / 1000).toFixed(1)}k` : s.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
