import Box from '@mui/material/Box'
import { tokens } from '../theme'

/** The catalog's mark (same drawing as the favicon): a table glyph on the brand blue. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" style={{ flex: 'none' }}>
      <rect width="24" height="24" rx="5" fill={tokens.accent} />
      <path d="M6 6h12v3H6zM6 10.5h4v3H6zM11.5 10.5H18v3h-6.5zM6 15h4v3H6zM11.5 15H18v3h-6.5z" fill="#fff" />
    </svg>
  )
}

/** "Light Data Catalog" with the last word in the accent, like formare.dev's "Formare AI" wordmark. */
export function Wordmark({ inverse = false, size = 24 }: { inverse?: boolean; size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: 1.25,
        fontSize: size >= 28 ? '1.375rem' : '1.125rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1,
        color: inverse ? tokens.inverse.ink : tokens.ink, whiteSpace: 'nowrap',
      }}
    >
      <BrandMark size={size} />
      <span>
        Light Data{' '}
        <Box component="span" sx={{ color: inverse ? tokens.inverse.accent : tokens.accent, fontWeight: 500 }}>Catalog</Box>
      </span>
    </Box>
  )
}
