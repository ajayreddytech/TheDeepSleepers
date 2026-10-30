import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

type PeriodOffset = -1 | 0 | 1

type PeriodStripProps = {
  // Changes whenever the anchored period changes, so the strip re-centres on the current period.
  periodKey: string
  canAdvance: boolean
  onStep: (direction: -1 | 1) => void
  renderPeriod: (offset: PeriodOffset) => ReactNode
}

const OFFSETS: PeriodOffset[] = [-1, 0, 1]
const SETTLE_DELAY_MS = 120

// Three slots (previous, current, next) side by side. Neighbours peek in at the edges,
// and a settled scroll onto a neighbour moves the anchor one period in that direction.
export function PeriodStrip({ periodKey, canAdvance, onStep, renderPeriod }: PeriodStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const settleTimerRef = useRef<number | undefined>(undefined)

  const centerScrollLeft = () => {
    const scroller = scrollerRef.current
    const center = scroller?.children[1] as HTMLElement | undefined
    if (!scroller || !center) return null
    return center.offsetLeft - (scroller.clientWidth - center.offsetWidth) / 2
  }

  const recenter = (behavior: ScrollBehavior) => {
    const scroller = scrollerRef.current
    const left = centerScrollLeft()
    if (!scroller || left === null) return
    scroller.scrollTo({ left, behavior })
  }

  // Runs before paint so a new period never flashes at the wrong slot.
  useLayoutEffect(() => {
    recenter('auto')
  }, [periodKey])

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), [])

  const settle = () => {
    const scroller = scrollerRef.current
    const center = scroller?.children[1] as HTMLElement | undefined
    const next = scroller?.children[2] as HTMLElement | undefined
    const centerLeft = centerScrollLeft()
    if (!scroller || !center || !next || centerLeft === null) return

    const step = next.offsetLeft - center.offsetLeft
    const slotsMoved = Math.round((scroller.scrollLeft - centerLeft) / step)
    if (slotsMoved === 0) return

    const direction = slotsMoved < 0 ? -1 : 1
    if (direction === 1 && !canAdvance) {
      recenter('smooth')
      return
    }
    onStep(direction)
  }

  const handleScroll = () => {
    window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(settle, SETTLE_DELAY_MS)
  }

  return (
    <div ref={scrollerRef} className="period-strip" onScroll={handleScroll}>
      {OFFSETS.map((offset) => {
        const isCurrent = offset === 0
        const isBlankFuture = offset === 1 && !canAdvance
        return (
          <div key={offset} className={`period-slot ${isCurrent ? 'current' : ''}`} inert={!isCurrent}>
            {isBlankFuture ? null : renderPeriod(offset)}
          </div>
        )
      })}
    </div>
  )
}
