import { IconSearch, IconFilterOff } from '@tabler/icons-react'

const QUELLEN = [
  { value: '', label: 'Alle' },
  { value: 'jam', label: 'Jams' },
  { value: 'megamix', label: 'MegaMix' },
  { value: 'zin', label: 'ZIN' }
]

// Linke Spalte: Suchfelder und Filter. Welche Filter erscheinen, hängt von der Quelle ab:
// Jam-Filter (Jammer, Ort, Zeitraum, Jam) bei „Alle“/„Jams“, Edition bei MegaMix bzw. ZIN.
export default function FilterPanel({ filters, set, setQuelle, lists, filteredJams, jamLabel, onReset, hasFilter }) {
  const { quelle } = filters
  const showJam = quelle === '' || quelle === 'jam'

  return (
    <aside className="pane pane-filter" aria-label="Filter">
      <div className="pane-header">
        <span className="pane-title">Filter</span>
        {hasFilter && (
          <button className="link" style={{ marginLeft: 'auto' }} onClick={onReset}>
            <IconFilterOff size={14} stroke={1.8} /> Zurücksetzen
          </button>
        )}
      </div>
      <div className="filters">
        <div className="field">
          <label htmlFor="f-song">Song</label>
          <div className="input-icon">
            <IconSearch size={15} stroke={1.8} />
            <input
              id="f-song"
              type="search"
              value={filters.song}
              onChange={(e) => set('song', e.target.value)}
              placeholder="Titel oder Teil davon"
              autoFocus
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-rhythm">Rhythmus</label>
          <input
            id="f-rhythm"
            type="search"
            list="f-rhythm-list"
            value={filters.rhythm}
            onChange={(e) => set('rhythm', e.target.value)}
            placeholder="z. B. sal"
          />
          <datalist id="f-rhythm-list">
            {lists.rhythms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <span className="field-label">Quelle</span>
          <div className="segmented" role="radiogroup" aria-label="Quelle">
            {QUELLEN.map((q) => (
              <button
                key={q.value}
                role="radio"
                aria-checked={quelle === q.value}
                className={quelle === q.value ? 'active' : ''}
                onClick={() => setQuelle(q.value)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {showJam && (
          <div className="filter-group">
            <span className="filter-group-title">Jam Sessions</span>
            <div className="field">
              <label htmlFor="f-jammer">Jammer</label>
              <select id="f-jammer" value={filters.jammer} onChange={(e) => set('jammer', e.target.value)}>
                <option value="">Alle Jammer</option>
                {lists.jammers.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-ort">Ort</label>
              <input id="f-ort" type="search" value={filters.ort} onChange={(e) => set('ort', e.target.value)} placeholder="z. B. Musterstadt" />
            </div>
            <div className="field">
              <span className="field-label">Zeitraum</span>
              <div className="field-row">
                <input type="date" aria-label="von" value={filters.datumVon} onChange={(e) => set('datumVon', e.target.value)} />
                <input type="date" aria-label="bis" value={filters.datumBis} onChange={(e) => set('datumBis', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-jam">Jam ({filteredJams.length})</label>
              <select id="f-jam" value={filters.jamId} onChange={(e) => set('jamId', e.target.value)}>
                <option value="">Alle Jams</option>
                {filteredJams.map((j) => (
                  <option key={j.id} value={String(j.id)}>
                    {jamLabel(j)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {quelle === 'megamix' && (
          <div className="filter-group">
            <div className="field">
              <label htmlFor="f-megamix">MegaMix</label>
              <select id="f-megamix" value={filters.megamix} onChange={(e) => set('megamix', e.target.value)}>
                <option value="">Alle MegaMixe</option>
                {lists.megamixes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {quelle === 'zin' && (
          <div className="filter-group">
            <div className="field">
              <label htmlFor="f-zin">ZIN Volume</label>
              <select id="f-zin" value={filters.zinVolume} onChange={(e) => set('zinVolume', e.target.value)}>
                <option value="">Alle ZIN Volumes</option>
                {lists.zinVolumes.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
