import Chip from '@mui/material/Chip'

export default function TagChip({ tag, onClick }: { tag: string; onClick?: () => void }) {
  return (
    <Chip
      label={tag}
      size="small"
      variant="outlined"
      onClick={onClick}
      sx={{
        fontSize: '0.7rem',
        height: 22,
        borderColor: '#dadce0',
        color: '#5f6368',
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { backgroundColor: '#f1f3f4', borderColor: '#1a73e8' } : {},
      }}
    />
  )
}
