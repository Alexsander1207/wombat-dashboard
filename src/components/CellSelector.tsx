import type { ExplorerCell, ExplorerData } from '../adapters/toExplorer.ts'

/** Native, keyboard-accessible selection over the verified cells in source order. */
export function CellSelector({ bundle, selected, onSelect, accessibleName = 'Choose a cell' }: {
  bundle: ExplorerData
  selected: ExplorerCell | null
  onSelect: (cell: ExplorerCell) => void
  accessibleName?: string
}) {
  return (
    <label className="explorer-field explorer-cell-selector">
      All cells
      <select aria-label={accessibleName} value={selected?.id ?? ''}
        onChange={event => {
          const cell = bundle.cells.find(candidate => candidate.id === event.target.value)
          if (cell) onSelect(cell)
        }}>
        <option value="" disabled>Choose a cell</option>
        {bundle.cells.map(cell => (
          <option key={cell.id} value={cell.id}>
            {cell.rank === null ? 'Not ranked' : `#${cell.rank}`} · {cell.cellId}
          </option>
        ))}
      </select>
    </label>
  )
}
