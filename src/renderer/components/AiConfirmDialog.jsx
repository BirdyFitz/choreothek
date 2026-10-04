import { useState, useEffect, useRef } from 'react'
import { IconSparkles } from '@tabler/icons-react'
import { formatEur } from '../lib/money.js'
import { t } from '../../shared/i18n.js'

// Meldung „Jetzt wird die KI genutzt“ (Grundsatz 5): Anbieter, Modell, was gesendet wird,
// geschätzte Kosten und Restguthaben; Abbrechen oder bestätigen, wahlweise „Nicht mehr fragen“.
export default function AiConfirmDialog({ plan, onConfirm, onCancel }) {
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // „Nachfragen an“ ist kein Grund, der erklärt werden muss -- nur das Sicherheitsnetz
  const safetyReasons = plan.reasons.filter((r) => r !== 'ask')
  const units = plan.kind === 'jam' ? t('aiDialog.unitsJam', { count: plan.items.length }) : t('aiDialog.unitsZin', { count: plan.items.length })

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title">
        <h2 id="ai-dialog-title">
          <IconSparkles size={18} stroke={1.8} /> {t('aiDialog.title')}
        </h2>

        <dl className="props">
          <dt>{t('aiDialog.provider')}</dt>
          <dd>
            {plan.providerLabel} · {plan.model}
          </dd>
          <dt>{t('aiDialog.sends')}</dt>
          <dd>{t('aiDialog.sendsValue', { units, pdfs: plan.pdfCount, pages: plan.pages })}</dd>
          <dt>{t('aiDialog.cost')}</dt>
          <dd>
            {t('aiDialog.costValue', { amount: formatEur(plan.estimate.costEur) })}
            {!plan.estimate.measured && <span className="muted"> {t('aiDialog.costRough')}</span>}
          </dd>
          {plan.balance && (
            <>
              <dt>{t('aiDialog.balance')}</dt>
              <dd>{t('aiDialog.balanceValue', { now: formatEur(plan.balance.remainingEur), after: formatEur(plan.balance.afterEur) })}</dd>
            </>
          )}
        </dl>

        {plan.items.length <= 8 && (
          <ul className="modal-list">
            {plan.items.map((item) => (
              <li key={item.label}>{t('aiDialog.item', { label: item.label, pages: item.pages })}</li>
            ))}
          </ul>
        )}

        {safetyReasons.length > 0 && (
          <div className="alert warning">
            {t('aiDialog.reasonsTitle')}
            <ul>
              {safetyReasons.map((r) => (
                <li key={r}>{t(`aiDialog.reasons.${r}`, { limit: formatEur(plan.costLimitEur) })}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="muted">{t('aiDialog.privacy', { provider: plan.providerLabel })}</p>

        <label className="check">
          <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} />
          <span>{t('aiDialog.dontAskAgain')}</span>
        </label>

        <div className="button-row modal-buttons">
          <button type="button" ref={cancelRef} onClick={onCancel}>
            {t('aiDialog.cancel')}
          </button>
          <button type="button" className="primary" onClick={() => onConfirm({ dontAskAgain })}>
            <IconSparkles size={16} stroke={1.6} /> {t('aiDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
