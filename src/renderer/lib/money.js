import { t } from '../../shared/i18n.js'

// Geschätzte Beträge in Euro (der Server rechnet die Dollar-Preise um); Kleinstbeträge mit drei
// Nachkommastellen, damit „0,00 €“ nicht nach kostenlos aussieht
export function formatEur(value) {
  if (value == null) return t('ai.unknownAmount')
  const digits = Math.abs(value) > 0 && Math.abs(value) < 0.1 ? 3 : 2
  return `${value.toLocaleString(t('meta.dateLocale'), { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`
}

export function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(t('meta.dateLocale')) : ''
}
