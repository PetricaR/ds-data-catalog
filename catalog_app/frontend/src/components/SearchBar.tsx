import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import { tokens } from '../theme'

const { inverse } = tokens

/** The header search box. It mirrors the query of the results page, so it always shows what was searched. */
export default function SearchBar({ placeholder = 'Search datasets, tables, columns…' }: { placeholder?: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const urlQuery = location.pathname === '/search' ? new URLSearchParams(location.search).get('q') ?? '' : ''
  const [value, setValue] = useState(urlQuery)

  useEffect(() => setValue(urlQuery), [urlQuery])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = value.trim()
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <Box
      component="form"
      role="search"
      onSubmit={submit}
      sx={{
        display: 'flex', alignItems: 'center', width: '100%', height: 38, pl: 1.25, pr: 0.5,
        bgcolor: inverse.surface, border: `1px solid ${inverse.rule}`, borderRadius: `${tokens.radius}px`,
        transition: 'border-color .15s',
        '&:hover': { borderColor: inverse.ruleStrong },
        '&:focus-within': { borderColor: inverse.accent, outline: `1px solid ${inverse.accent}` },
      }}
    >
      <SearchIcon aria-hidden sx={{ color: inverse.ink3, fontSize: 20, mr: 1 }} />
      <InputBase
        fullWidth
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        inputProps={{ 'aria-label': 'Search the catalog', enterKeyHint: 'search' }}
        sx={{
          color: inverse.ink, fontSize: '0.875rem',
          '& input::placeholder': { color: inverse.ink3, opacity: 1 },
          '& input::-webkit-search-cancel-button': { display: 'none' },
        }}
      />
      {value && (
        <IconButton size="small" aria-label="Clear search" onClick={() => setValue('')} sx={{ color: inverse.ink3, '&:hover': { color: inverse.ink, bgcolor: 'transparent' } }}>
          <ClearIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  )
}
