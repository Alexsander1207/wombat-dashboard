/**
 * Pruebas del modo vivo: lectura del gateway, sondeo y panel "En vivo".
 *
 * El gateway se simula con `fetch` falso; ninguna prueba sale a la red.
 */
import React from 'react'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import {
  areaEventUrl,
  parseLatestEvent,
  type LiveEvent,
} from '../src/live/gateway.ts'
import {
  DEFAULT_POLL_SECONDS,
  MAX_EVENTS,
  MIN_POLL_SECONDS,
  mergeEvent,
  pollSecondsOf,
  useLiveEvents,
  type LiveState,
} from '../src/hooks/useLiveEvents.ts'
import { LiveFeed } from '../src/components/LiveFeed.tsx'

const ID_A = `sha256:${'a'.repeat(64)}`
const ID_B = `sha256:${'b'.repeat(64)}`

/** La forma que devuelve hoy /api/v1/events/latest. */
function gatewayResponse(overrides: Record<string, unknown> = {}) {
  return {
    wonb_id: ID_A,
    aoi_id: 'piura-demo',
    type: 'change',
    topic: 'wombat/pe/piura/piura-demo/change',
    issued_at: '2026-11-15T20:54:49.245961871Z',
    simulation: true,
    data_origin: 'simulated',
    verified: true,
    payload: { aoi_id: 'piura-demo' },
    provenance: {
      code_commit: 'simulated',
      method: 'wombat-demo-publisher/simulated/1',
      sources: [{ product: 'SIMULATED-WOMBAT-DEMO', message: 'DEMO SIMULADA — no es alerta científica' }],
    },
    ...overrides,
  }
}

function okFetch(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('parseLatestEvent', () => {
  it('lee el evento del gateway y lo marca como simulado', () => {
    const event = parseLatestEvent(gatewayResponse())
    expect(event).toMatchObject({
      wonbId: ID_A,
      aoiId: 'piura-demo',
      type: 'change',
      simulated: true,
      gatewayVerified: true,
    })
  })

  it('solo trata como real un evento nisar_real sin marca de simulación', () => {
    expect(parseLatestEvent(gatewayResponse({ simulation: false, data_origin: 'nisar_real' })).simulated).toBe(false)
    // Procedencia desconocida o ausente: ante la duda, simulado.
    expect(parseLatestEvent(gatewayResponse({ simulation: false, data_origin: 'otra' })).simulated).toBe(true)
    expect(parseLatestEvent(gatewayResponse({ simulation: undefined, data_origin: undefined })).simulated).toBe(true)
    // Una marca de simulación gana aunque diga nisar_real.
    expect(parseLatestEvent(gatewayResponse({ simulation: true, data_origin: 'nisar_real' })).simulated).toBe(true)
  })

  it('no da por comprobado lo que el gateway no marca', () => {
    expect(parseLatestEvent(gatewayResponse({ verified: undefined })).gatewayVerified).toBe(false)
    expect(parseLatestEvent(gatewayResponse({ verified: 'true' })).gatewayVerified).toBe(false)
  })

  it('rechaza una respuesta a medias', () => {
    expect(() => parseLatestEvent(null)).toThrow()
    expect(() => parseLatestEvent([])).toThrow()
    expect(() => parseLatestEvent(gatewayResponse({ wonb_id: undefined }))).toThrow(/wonb_id/)
    expect(() => parseLatestEvent(gatewayResponse({ wonb_id: 'no-es-un-hash' }))).toThrow(/sha256/)
    expect(() => parseLatestEvent(gatewayResponse({ issued_at: '' }))).toThrow(/issued_at/)
  })

  it('arma la URL del API sin duplicar barras', () => {
    expect(areaEventUrl('https://gw.example/', 'piura-demo')).toBe('https://gw.example/api/v1/events/piura-demo')
    expect(areaEventUrl('https://gw.example', 'tailandia-01')).toBe('https://gw.example/api/v1/events/tailandia-01')
  })
})

describe('intervalo y memoria de eventos', () => {
  it('usa 60 s por defecto y no baja del piso', () => {
    expect(pollSecondsOf({ url: 'https://gw.example' })).toBe(DEFAULT_POLL_SECONDS)
    expect(pollSecondsOf({ url: 'https://gw.example', pollSeconds: 1 })).toBe(MIN_POLL_SECONDS)
    expect(pollSecondsOf({ url: 'https://gw.example', pollSeconds: 120 })).toBe(120)
  })

  it('no repite un evento ya visto y conserva un máximo', () => {
    const a = parseLatestEvent(gatewayResponse())
    const b = parseLatestEvent(gatewayResponse({ wonb_id: ID_B }))
    expect(mergeEvent([a], a)).toEqual([a])
    expect(mergeEvent([a], b)).toEqual([b, a])

    let events: LiveEvent[] = []
    for (let i = 0; i < MAX_EVENTS + 5; i += 1) {
      const id = `sha256:${i.toString(16).padStart(64, '0')}`
      events = mergeEvent(events, { ...a, wonbId: id })
    }
    expect(events).toHaveLength(MAX_EVENTS)
  })
})

describe('useLiveEvents', () => {
  it('sin gateway configurado no hace ninguna petición', () => {
    const fetchMock = okFetch(gatewayResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useLiveEvents(null, 'piura-demo'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.events).toEqual([])
  })

  it('consulta al montar y luego una vez por intervalo', async () => {
    vi.useFakeTimers()
    const fetchMock = okFetch(gatewayResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useLiveEvents({ url: 'https://gw.example', pollSeconds: 60 }, 'piura-demo'),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://gw.example/api/v1/events/piura-demo')
    expect(result.current.status).toBe('online')
    expect(result.current.events).toHaveLength(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(59_000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // El mismo evento otra vez no se duplica.
    expect(result.current.events).toHaveLength(1)
  })

  it('en segundo plano no consulta, y al volver a la pestaña consulta enseguida', async () => {
    vi.useFakeTimers()
    const fetchMock = okFetch(gatewayResponse())
    vi.stubGlobal('fetch', fetchMock)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    const { result } = renderHook(() =>
      useLiveEvents({ url: 'https://gw.example', pollSeconds: 60 }, 'piura-demo'),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.status).toBe('connecting')

    visibility.mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('online')
    visibility.mockRestore()
  })

  it('pide el evento del área elegida y cambia de URL al cambiar de área', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/piura-demo')
        ? new Response(JSON.stringify(gatewayResponse()), { status: 200 })
        : new Response(JSON.stringify({ error: 'no_verified_events' }), { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(
      ({ aoi }: { aoi: string }) => useLiveEvents({ url: 'https://gw.example' }, aoi),
      { initialProps: { aoi: 'piura-demo' } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.events).toHaveLength(1)

    rerender({ aoi: 'tailandia-01' })
    // Lo visto de Piura no se arrastra a Tailandia ni un render.
    expect(result.current.events).toEqual([])
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('https://gw.example/api/v1/events/tailandia-01')
    // El gateway responde, pero esa área aún no tiene eventos: conectado y vacío.
    expect(result.current.status).toBe('online')
    expect(result.current.events).toEqual([])
  })

  it('no acepta un evento de otra área como si fuera de la pedida', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', okFetch(gatewayResponse({ aoi_id: 'piura-demo' })))
    const { result } = renderHook(() => useLiveEvents({ url: 'https://gw.example' }, 'tailandia-01'))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('online')
    expect(result.current.events).toEqual([])
  })

  it('si el gateway cae, queda sin conexión y conserva lo ya visto', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(gatewayResponse()), { status: 200 }))
      .mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useLiveEvents({ url: 'https://gw.example', pollSeconds: 60 }, 'piura-demo'),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('online')

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(result.current.status).toBe('offline')
    expect(result.current.error).toMatch(/Failed to fetch/)
    expect(result.current.events).toHaveLength(1)
  })

  it('un HTTP de error cuenta como sin conexión', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('caído', { status: 502 })))
    const { result } = renderHook(() => useLiveEvents({ url: 'https://gw.example' }, 'piura-demo'))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.status).toBe('offline')
    expect(result.current.error).toMatch(/502/)
    expect(result.current.events).toEqual([])
  })
})

describe('LiveFeed', () => {
  const event = parseLatestEvent(gatewayResponse())
  const piura = { aoiId: 'piura-demo', dataOrigin: 'simulated', issuedAt: '2026-11-14T17:00:00Z' }
  const thailand = { aoiId: 'tailandia-01', dataOrigin: 'nisar_real', issuedAt: '2026-11-15T15:17:00Z' }
  const online: LiveState = {
    status: 'online',
    events: [event],
    lastChecked: '2026-11-15T20:55:00.000Z',
    error: null,
  }

  it('con evento del área: lo muestra, como dato de demostración y sin firma verificada aquí', () => {
    render(<LiveFeed state={online} pollSeconds={60} area={piura} />)
    expect(screen.getByText('Change observed')).toBeInTheDocument()
    expect(screen.getByText('Demo data')).toBeInTheDocument()
    expect(screen.queryByText('Simulated')).not.toBeInTheDocument()
    // El aviso largo del productor no se muestra: basta la etiqueta.
    expect(screen.queryByText(/DEMO SIMULADA/)).not.toBeInTheDocument()
    expect(screen.getByText(/not by this browser/)).toBeInTheDocument()
    expect(screen.getByText(/Updates every 60 s/)).toBeInTheDocument()
    // Los nanosegundos de issued_at no rompen la fecha.
    expect(screen.getByText(/piura-demo · issued .*2026.*UTC/)).toBeInTheDocument()
  })

  it('un evento simulado nunca se rotula como dato real', () => {
    render(<LiveFeed state={online} pollSeconds={60} area={{ ...piura, dataOrigin: 'nisar_real' }} />)
    expect(screen.queryByText('Real NISAR data')).not.toBeInTheDocument()
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })

  it('en Tailandia no muestra el evento de Piura: usa el registro firmado del área', () => {
    render(<LiveFeed state={online} pollSeconds={60} area={thailand} />)
    expect(screen.queryByText(/piura-demo/)).not.toBeInTheDocument()
    expect(screen.getByText(/tailandia-01 · issued 15 Nov 2026, 15:17 UTC/)).toBeInTheDocument()
    expect(screen.getByText('Real NISAR data')).toBeInTheDocument()
    expect(screen.getByText(/verified in this browser/)).toBeInTheDocument()
    expect(screen.getByText(/No newer event on the network for this area yet/)).toBeInTheDocument()
  })

  it('sin conexión lo dice, aclara que el mapa sigue y conserva el registro del área', () => {
    render(
      <LiveFeed
        state={{ status: 'offline', events: [], lastChecked: null, error: 'x' }}
        pollSeconds={60}
        area={thailand}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Offline')
    expect(screen.getByText(/The map still shows the verified data/)).toBeInTheDocument()
    expect(screen.getByText(/tailandia-01 · issued/)).toBeInTheDocument()
  })
})

describe('dashboard.config.json · gateway', () => {
  it('si declara un gateway, es una URL https y un intervalo razonable', async () => {
    const config = JSON.parse(
      await readFile(join(process.cwd(), 'dashboard.config.json'), 'utf8'),
    ) as { gateway?: { url: string; pollSeconds?: number } }
    if (!config.gateway) return
    // El sitio se sirve por https: un gateway http quedaría bloqueado por el navegador.
    expect(config.gateway.url).toMatch(/^https:\/\/[^/]+$/)
    expect(pollSecondsOf(config.gateway)).toBeGreaterThanOrEqual(MIN_POLL_SECONDS)
  })
})
