import { useEffect, useRef, useState } from 'react'
import { Menu, Map, Layers3, ShieldCheck, BookOpen } from 'lucide-react'
import { nextNavigationIndex } from '../frontend/navigation'

export type NavigationDestination = 'explore' | 'layers' | 'evidence' | 'guide'
const destinations = [
  { id: 'explore', title: 'Explorar', Icon: Map },
  { id: 'layers', title: 'Capas', Icon: Layers3 },
  { id: 'evidence', title: 'Evidencia', Icon: ShieldCheck },
  { id: 'guide', title: 'Metodología', Icon: BookOpen },
] as const

export function FloatingNavigation({
  active,
  onNavigate,
}: {
  active: NavigationDestination
  onNavigate: (destination: NavigationDestination) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div
      className="floating-navigation"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false)
      }}
    >
      <button
        ref={trigger}
        className="hamburger-trigger"
        aria-label={
          open ? 'Cerrar el menú de navegación' : 'Abrir el menú de navegación'
        }
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="explorer-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <Menu size={21} aria-hidden="true" />
      </button>
      {open && (
        <nav
          ref={panel}
          id="explorer-navigation"
          className="floating-menu"
          aria-label="Navegación del explorador"
          role="menu"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
            )
            const next = nextNavigationIndex(
              event.key,
              buttons.indexOf(document.activeElement as HTMLButtonElement),
            )
            if (next !== null) {
              event.preventDefault()
              buttons[next]?.focus()
            }
          }}
        >
          <span className="floating-menu-caption" role="presentation">
            WOMBAT EXPLORER
          </span>
          <div className="navigation-card-grid" role="presentation">
            {destinations.map(({ id, title, Icon }) => (
              <button
                key={id}
                className="navigation-card"
                role="menuitem"
                aria-current={active === id ? 'page' : undefined}
                onClick={() => {
                  onNavigate(id)
                  setOpen(false)
                  trigger.current?.focus()
                }}
              >
                <Icon size={23} aria-hidden="true" />
                <span>{title}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
