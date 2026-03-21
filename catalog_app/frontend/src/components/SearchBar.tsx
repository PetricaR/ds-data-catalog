import { useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'

interface SearchBarProps {
  defaultValue?: string
  placeholder?: string
  size?: 'small' | 'large'
  onSearch?: (q: string) => void
}

export default function SearchBar({
  defaultValue = '',
  placeholder = 'Search datasets, tables, columns…',
  size = 'large',
  onSearch,
}: SearchBarProps) {
  const [value, setValue] = useState(defaultValue)
  const navigate = useNavigate()

  const handleSearch = () => {
    if (!value.trim()) return
    if (onSearch) {
      onSearch(value.trim())
    } else {
      navigate(`/search?q=${encodeURIComponent(value.trim())}`)
    }
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const isLarge = size === 'large'

  return (
    <Paper
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        border: '1px solid #dadce0',
        borderRadius: isLarge ? '24px' : '8px',
        px: isLarge ? 2 : 1,
        py: isLarge ? 0.75 : 0.25,
        '&:hover': { boxShadow: '0 1px 6px rgba(32,33,36,.28)', borderColor: 'rgba(223,225,229,0)' },
        '&:focus-within': { boxShadow: '0 1px 6px rgba(32,33,36,.28)', borderColor: 'rgba(223,225,229,0)' },
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      <SearchIcon sx={{ color: '#9aa0a6', mr: 1, fontSize: isLarge ? 24 : 20 }} />
      <InputBase
        fullWidth
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        inputProps={{ 'aria-label': 'search catalog' }}
        sx={{ fontSize: isLarge ? '1rem' : '0.875rem' }}
      />
      {value && (
        <IconButton size="small" onClick={() => setValue('')} sx={{ color: '#9aa0a6' }}>
          <ClearIcon fontSize="small" />
        </IconButton>
      )}
      <IconButton
        onClick={handleSearch}
        size={isLarge ? 'medium' : 'small'}
        sx={{ color: '#1a73e8', ml: 0.5 }}
      >
        <SearchIcon fontSize={isLarge ? 'medium' : 'small'} />
      </IconButton>
    </Paper>
  )
}
