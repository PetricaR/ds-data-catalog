import Chip from '@mui/material/Chip'
import type { SensitivityLabel } from '../api/types'

const config: Record<SensitivityLabel, { label: string; color: string; bg: string }> = {
  public:       { label: 'Public',       color: '#137333', bg: '#e6f4ea' },
  internal:     { label: 'Internal',     color: '#1a73e8', bg: '#e8f0fe' },
  confidential: { label: 'Confidential', color: '#e37400', bg: '#fef7e0' },
  restricted:   { label: 'Restricted',   color: '#d93025', bg: '#fce8e6' },
}

export default function SensitivityChip({
  label,
  size = 'small',
}: {
  label: SensitivityLabel
  size?: 'small' | 'medium'
}) {
  const { label: text, color, bg } = config[label] ?? config.internal
  return (
    <Chip
      label={text}
      size={size}
      sx={{
        color,
        backgroundColor: bg,
        fontWeight: 500,
        fontSize: '0.7rem',
        height: size === 'small' ? 22 : 28,
      }}
    />
  )
}
