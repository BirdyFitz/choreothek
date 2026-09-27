import { useState } from 'react'
import axios from 'axios'
import { IconArrowLeft, IconArrowRight, IconCheck, IconLock } from '@tabler/icons-react'
import FolderSettings from '../components/FolderSettings.jsx'
import AiSettings from '../components/AiSettings.jsx'
import ImportPreview from '../components/ImportPreview.jsx'
import ImportCard from '../components/ImportCard.jsx'
import { t } from '../../shared/i18n.js'

const STEPS = ['welcome', 'folders', 'ai', 'import']

// Einrichtungsassistent (erster Start): Willkommen, Ordner, KI, Vorschau und Einlesen.
// Nutzt dieselben Bausteine wie „Datenquellen“; jeder Schritt lässt sich überspringen.
export default function SetupWizard({ onFinish }) {
  const [step, setStep] = useState(0)
  const id = STEPS[step]
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  const finish = async () => {
    try {
      await axios.post('/api/setup', { done: true })
    } finally {
      onFinish()
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <ol className="wizard-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''}>
              <button type="button" className="link" onClick={() => setStep(i)}>
                {i < step ? <IconCheck size={14} stroke={2} /> : <span className="step-no">{i + 1}</span>} {t(`wizard.steps.${s}`)}
              </button>
            </li>
          ))}
        </ol>

        {id === 'welcome' && (
          <div className="card">
            <h2>{t('wizard.welcome.title')}</h2>
            <p>{t('wizard.welcome.text')}</p>
            <div className="wizard-note">
              <IconLock size={18} stroke={1.6} />
              <span>{t('wizard.welcome.privacy')}</span>
            </div>
            <ul className="wizard-list">
              <li>{t('wizard.welcome.needFolders')}</li>
              <li>{t('wizard.welcome.needKey')}</li>
              <li>{t('wizard.welcome.megamixNoAi')}</li>
            </ul>
          </div>
        )}

        {id === 'folders' && <FolderSettings onSaved={next} saveLabel={t('wizard.saveAndNext')} />}

        {id === 'ai' && (
          <>
            <p className="hint">{t('wizard.ai.hint')}</p>
            <AiSettings />
          </>
        )}

        {id === 'import' && (
          <>
            <p className="hint">{t('wizard.import.hint')}</p>
            <ImportPreview />
            <ImportCard />
          </>
        )}

        <div className="button-row wizard-nav">
          {step > 0 && (
            <button type="button" onClick={back}>
              <IconArrowLeft size={16} stroke={1.6} /> {t('wizard.back')}
            </button>
          )}
          <span className="spacer" />
          {step < STEPS.length - 1 ? (
            <button type="button" className={id === 'welcome' ? 'primary' : ''} onClick={next}>
              {id === 'welcome' ? t('wizard.start') : id === 'folders' ? t('wizard.skip') : t('wizard.next')} <IconArrowRight size={16} stroke={1.6} />
            </button>
          ) : (
            <button type="button" className="primary" onClick={finish}>
              <IconCheck size={16} stroke={1.6} /> {t('wizard.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
