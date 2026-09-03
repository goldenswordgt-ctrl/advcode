import { createEffect, createSignal, onCleanup } from "solid-js"
import { useTheme } from "../context/theme"
import { Logo } from "./logo"

const TRANSITION_DURATION = 900

/**
 * Wraps Logo and triggers a brief flowing transition when the theme changes.
 * The logo ripples as the new theme's colors take over.
 */
export function LogoTransition() {
  const theme = useTheme()
  const [transitioning, setTransitioning] = createSignal(false)
  let timeout: ReturnType<typeof setTimeout> | undefined
  let prevTheme = theme.selected

  createEffect(() => {
    const current = theme.selected
    if (current !== prevTheme) {
      prevTheme = current
      if (timeout) clearTimeout(timeout)
      setTransitioning(true)
      timeout = setTimeout(() => setTransitioning(false), TRANSITION_DURATION)
    }
  })

  onCleanup(() => {
    if (timeout) clearTimeout(timeout)
  })

  return <Logo />
}
