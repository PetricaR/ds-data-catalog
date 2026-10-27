import { MetaPill } from './ui'

// Tags in formare.dev's style: monospace on a hairline
export default function TagChip({ tag }: { tag: string }) {
  return <MetaPill mono title={`Tag: ${tag}`}>{tag}</MetaPill>
}
