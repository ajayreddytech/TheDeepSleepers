import { memo, useRef, useState, type CSSProperties } from 'react'

export type HeatmapTone = 'done' | 'missed' | 'empty' | 'spacer'
type HeatmapRange = 'day' | 'week' | 'month' | 'year'

export type HeatmapCell = {
  key: string
  date: string | null
  tone: HeatmapTone
  label: string
  tooltip: string
}

type HeatmapGridProps = {
  cells: HeatmapCell[]
  range: HeatmapRange
  onSelectDate: (date: string) => void
}

type TooltipState = { text: string; left: number; top: number }

type HeatTilesProps = Pick<HeatmapGridProps, 'cells' | 'onSelectDate'>

// Memoized so hovering (which only updates the tooltip state) never re-renders the tile list.
const HeatTiles = memo(function HeatTiles({ cells, onSelectDate }: HeatTilesProps) {
  return (
    <>
      {cells.map((cell) => {
        const { date } = cell
        return date !== null ? (
          <button
            key={cell.key}
            type="button"
            data-date={date}
            data-tooltip={cell.tooltip}
            className={`heat-tile ${cell.tone}`}
            aria-label={cell.label}
            onClick={() => onSelectDate(date)}
          />
        ) : (
          <span key={cell.key} className={`heat-tile ${cell.tone}`} aria-hidden="true" />
        )
      })}
    </>
  )
})

export function HeatmapGrid({ cells, range, onSelectDate }: HeatmapGridProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const hoveredDateRef = useRef<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  // Reads only the hovered tile's rect, and only when the hovered date actually changes.
  const showTileTooltip = (target: EventTarget | null) => {
    const tile = target instanceof Element ? target.closest<HTMLElement>('[data-date]') : null
    const date = tile?.dataset.date ?? null
    if (date === hoveredDateRef.current) return
    hoveredDateRef.current = date

    const frame = frameRef.current
    if (!tile || !date || !frame) {
      setTooltip(null)
      return
    }
    const frameRect = frame.getBoundingClientRect()
    const tileRect = tile.getBoundingClientRect()
    setTooltip({
      text: tile.dataset.tooltip ?? '',
      left: tileRect.left - frameRect.left + tileRect.width / 2,
      top: tileRect.top - frameRect.top,
    })
  }

  const clearTooltip = () => {
    hoveredDateRef.current = null
    setTooltip(null)
  }

  const gridStyle: CSSProperties | undefined =
    range === 'year' ? undefined : { gridTemplateColumns: `repeat(${range === 'day' ? 1 : 7}, minmax(0, 1fr))` }

  return (
    <div
      ref={frameRef}
      className="heatmap-frame"
      onPointerOver={(event) => showTileTooltip(event.target)}
      onPointerLeave={clearTooltip}
      onFocus={(event) => showTileTooltip(event.target)}
      onBlur={clearTooltip}
    >
      <div className={`heatmap-grid ${range}`} style={gridStyle} onScroll={clearTooltip}>
        <HeatTiles cells={cells} onSelectDate={onSelectDate} />
      </div>
      {tooltip && (
        <div className="heat-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
