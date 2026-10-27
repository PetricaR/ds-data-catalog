import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import PublicIcon from '@mui/icons-material/Public'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import type { ReactElement } from 'react'
import type { SensitivityLabel } from '../api/types'
import type { Tone } from '../theme'
import { MetaPill } from './ui'

const config: Record<SensitivityLabel, { label: string; tone: Tone; icon?: ReactElement }> = {
  public:       { label: 'Public',       tone: 'success', icon: <PublicIcon /> },
  internal:     { label: 'Internal',     tone: 'neutral' },
  confidential: { label: 'Confidential', tone: 'warning', icon: <ShieldOutlinedIcon /> },
  restricted:   { label: 'Restricted',   tone: 'danger',  icon: <LockOutlinedIcon /> },
}

// Internal is the default label, so it isn't shown unless asked for
export default function SensitivityChip({ label, showInternal = false }: { label: SensitivityLabel; showInternal?: boolean }) {
  const cfg = config[label]
  if (!cfg || (label === 'internal' && !showInternal)) return null
  return (
    <MetaPill tone={cfg.tone} icon={cfg.icon} title={`Sensitivity: ${cfg.label}`}>
      {cfg.label}
    </MetaPill>
  )
}
