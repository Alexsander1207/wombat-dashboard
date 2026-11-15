import { AlertCircle, LoaderCircle, Database } from 'lucide-react'
export type DataState =
  | 'loading'
  | 'static'
  | 'simulated'
  | 'empty'
  | 'connection'
  | 'incompatible'
  | 'quality'
  | 'verification'
export function DataStatus({
  kind,
  title,
  detail,
}: {
  kind: DataState
  title: string
  detail?: string
}) {
  const Icon =
    kind === 'loading'
      ? LoaderCircle
      : ['static', 'simulated'].includes(kind)
        ? Database
        : AlertCircle
  return (
    <div className={`data-status state-${kind}`} role="status">
      <Icon size={16} />
      <div>
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  )
}
