import { IconSearch, IconFilterOff } from '@tabler/icons-react'
import { t } from '../../shared/i18n.js'

const QUELLEN = ['', 'jam', 'megamix', 'zin']
const QUELLEN_KEY = { '': 'all', jam: 'jam', megamix: 'megamix', zin: 'zin' }

// Linke Spalte: Suchfelder und Filter. Welche Filter erscheinen, hängt von der Quelle ab:
// bei „Alle“ alle Gruppen, sonst nur die der gewählten Quelle.
export default function FilterPanel({ width, filters, set, setQuelle, lists, filteredJams, jamLabel, onReset, hasFilter }) {
  const { quelle } = filters
  const showJam = quelle === '' || quelle === 'jam'
  const showMegamix = quelle === '' || quelle === 'megamix'
  const showZin = quelle === '' || quelle === 'zin'

  return (
    <aside className="pane pane-filter" aria-label={t('filter.title')} style={{ width }}>
      <div className="pane-header">
        <span className="pane-title">{t('filter.title')}</span>
        {hasFilter && (
          <button className="link" style={{ marginLeft: 'auto' }} onClick={onReset}>
            <IconFilterOff size={14} stroke={1.8} /> {t('filter.reset')}
          </button>
        )}
      </div>
      <div className="filters">
        <div className="field">
          <label htmlFor="f-song">{t('filter.song')}</label>
          <div className="input-icon">
            <IconSearch size={15} stroke={1.8} />
            <input
              id="f-song"
              type="search"
              value={filters.song}
              onChange={(e) => set('song', e.target.value)}
              placeholder={t('filter.songPlaceholder')}
              autoFocus
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-rhythm">{t('filter.rhythm')}</label>
          <input
            id="f-rhythm"
            type="search"
            list="f-rhythm-list"
            value={filters.rhythm}
            onChange={(e) => set('rhythm', e.target.value)}
            placeholder={t('filter.rhythmPlaceholder')}
          />
          <datalist id="f-rhythm-list">
            {lists.rhythms.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <span className="field-label">{t('filter.source')}</span>
          <div className="segmented" role="radiogroup" aria-label={t('filter.source')}>
            {QUELLEN.map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={quelle === value}
                className={quelle === value ? 'active' : ''}
                onClick={() => setQuelle(value)}
              >
                {t(`filter.sources.${QUELLEN_KEY[value]}`)}
              </button>
            ))}
          </div>
        </div>

        {showJam && (
          <div className="filter-group">
            <span className="filter-group-title">{t('filter.jamGroup')}</span>
            <div className="field">
              <label htmlFor="f-jammer">{t('filter.jammer')}</label>
              <select id="f-jammer" value={filters.jammer} onChange={(e) => set('jammer', e.target.value)}>
                <option value="">{t('filter.jammerAll')}</option>
                {lists.jammers.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-ort">{t('filter.location')}</label>
              <input
                id="f-ort"
                type="search"
                value={filters.ort}
                onChange={(e) => set('ort', e.target.value)}
                placeholder={t('filter.locationPlaceholder')}
              />
            </div>
            <div className="field">
              <span className="field-label">{t('filter.period')}</span>
              <div className="field-row">
                <input type="date" aria-label={t('filter.periodFrom')} value={filters.datumVon} onChange={(e) => set('datumVon', e.target.value)} />
                <input type="date" aria-label={t('filter.periodTo')} value={filters.datumBis} onChange={(e) => set('datumBis', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-jam">{t('filter.jam', { count: filteredJams.length })}</label>
              <select id="f-jam" value={filters.jamId} onChange={(e) => set('jamId', e.target.value)}>
                <option value="">{t('filter.jamAll')}</option>
                {filteredJams.map((j) => (
                  <option key={j.id} value={String(j.id)}>
                    {jamLabel(j)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {showMegamix && (
          <div className="filter-group">
            <div className="field">
              <label htmlFor="f-megamix">{t('filter.megamix')}</label>
              <select id="f-megamix" value={filters.megamix} onChange={(e) => set('megamix', e.target.value)}>
                <option value="">{t('filter.megamixAll')}</option>
                {lists.megamixes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {showZin && (
          <div className="filter-group">
            <div className="field">
              <label htmlFor="f-zin">{t('filter.zin')}</label>
              <select id="f-zin" value={filters.zinVolume} onChange={(e) => set('zinVolume', e.target.value)}>
                <option value="">{t('filter.zinAll')}</option>
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
