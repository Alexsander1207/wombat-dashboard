import type { LoadedBundle } from '../bundle/contract.ts';
import type { BundleCell } from '../bundle/types.ts';

export interface ExplorerCell extends BundleCell {
  id: string;
  /** Display ratio only; scoreBp remains the original signed integer. */
  score: number | null;
  center: [number, number] | null;
}
export interface ExplorerData extends Omit<LoadedBundle, 'cells'> {
  mode: 'verified' | 'simulated';
  cells: ExplorerCell[];
  before: { date: string; label: string };
  after: { date: string; label: string };
  boundary: [number, number, number, number];
  compatible: boolean;
}
export function toExplorer(bundle: LoadedBundle): ExplorerData {
  return {
    ...bundle,
    mode: bundle.dataOrigin === 'simulated' ? 'simulated' : 'verified',
    before: { date: bundle.t1, label: 'Antes (t1)' },
    after: { date: bundle.t2, label: 'Después (t2)' },
    boundary: bundle.manifest.bboxWgs84,
    compatible: bundle.manifest.comparable,
    cells: bundle.cells.map(cell => {
      const ring = cell.geometry?.coordinates[0];
      const points = ring?.slice(0, -1);
      const center: [number, number] | null = points?.length ? [
        points.reduce((sum, p) => sum + p[0], 0) / points.length,
        points.reduce((sum, p) => sum + p[1], 0) / points.length,
      ] : null;
      return {
        ...cell,
        id: cell.cellId,
        // risk.payload.rank is authoritative. An action cannot fill or replace it.
        rank: cell.status === 'insufficient_quality' ? null : cell.rank,
        score: cell.status === 'insufficient_quality' || cell.scoreBp === null ? null : cell.scoreBp / 10000,
        center,
      };
    }),
  };
}
