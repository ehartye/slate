import { describe, it, expect } from 'vitest'
import { PageRenders, isCancellation, type CancellableRender } from '../src/lib/pdfRender'

/** A stand-in for pdf.js's RenderTask: resolves when the "paint" finishes, or
 *  rejects with a RenderingCancelledException-shaped error when cancelled. */
function fakeTask() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  let cancelled = false
  const task: CancellableRender & {
    finish: () => void
    fail: (e: unknown) => void
    cancelled: () => boolean
  } = {
    promise,
    cancel() {
      cancelled = true
      const err = new Error('Rendering cancelled')
      err.name = 'RenderingCancelledException'
      reject(err)
    },
    finish: () => resolve(),
    fail: (e) => reject(e),
    cancelled: () => cancelled,
  }
  // Cancellation rejections are always consumed by cancel()/track(), but the
  // promise is also read here in tests; keep node from flagging it early.
  promise.catch(() => {})
  return task
}

describe('isCancellation', () => {
  it('recognizes pdf.js cancellation by name', () => {
    const e = new Error('Rendering cancelled')
    e.name = 'RenderingCancelledException'
    expect(isCancellation(e)).toBe(true)
  })

  it('does not treat other errors as cancellations', () => {
    expect(isCancellation(new Error('boom'))).toBe(false)
    expect(isCancellation(null)).toBe(false)
    expect(isCancellation('RenderingCancelledException')).toBe(false)
  })
})

describe('PageRenders', () => {
  it('reports a page as rendering only while its task is in flight', async () => {
    const renders = new PageRenders()
    const task = fakeTask()
    const tracked = renders.track(1, task)
    expect(renders.isRendering(1)).toBe(true)
    expect(renders.size).toBe(1)
    task.finish()
    await tracked
    expect(renders.isRendering(1)).toBe(false)
    expect(renders.size).toBe(0)
  })

  it('cancel() is a no-op when nothing is in flight', async () => {
    const renders = new PageRenders()
    await expect(renders.cancel(1)).resolves.toBeUndefined()
  })

  // The core guarantee the canvas-resize fix depends on: once cancel()
  // resolves, the old paint has actually stopped touching the canvas.
  it('cancel() waits for the task to unwind before resolving', async () => {
    const renders = new PageRenders()
    const task = fakeTask()
    let unwound = false
    void renders.track(1, task).then(() => {
      unwound = true
    })
    await renders.cancel(1)
    expect(task.cancelled()).toBe(true)
    expect(unwound).toBe(true)
    expect(renders.isRendering(1)).toBe(false)
  })

  it('a newer paint claiming a page survives the cancelled one unwinding', async () => {
    const renders = new PageRenders()
    const first = fakeTask()
    void renders.track(1, first)
    const cancelling = renders.cancel(1)
    // The replacement claims the slot while the cancelled task is unwinding —
    // exactly what renderPage does after awaiting cancel().
    const second = fakeTask()
    void renders.track(1, second)
    await cancelling
    expect(renders.isRendering(1)).toBe(true)
    second.finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(second.cancelled()).toBe(false)
  })

  it('track() swallows a cancellation but rethrows real errors', async () => {
    const renders = new PageRenders()
    const cancelled = fakeTask()
    const tracked = renders.track(1, cancelled)
    cancelled.cancel()
    await expect(tracked).resolves.toBeUndefined()

    const broken = fakeTask()
    const failing = renders.track(2, broken)
    broken.fail(new Error('canvas exploded'))
    await expect(failing).rejects.toThrow('canvas exploded')
    expect(renders.isRendering(2)).toBe(false)
  })

  it('cancelAll() stops every in-flight paint', async () => {
    const renders = new PageRenders()
    const tasks = [fakeTask(), fakeTask(), fakeTask()]
    tasks.forEach((t, i) => void renders.track(i + 1, t))
    expect(renders.size).toBe(3)
    await renders.cancelAll()
    expect(renders.size).toBe(0)
    expect(tasks.every((t) => t.cancelled())).toBe(true)
  })

  it('tracks pages independently', async () => {
    const renders = new PageRenders()
    const one = fakeTask()
    const two = fakeTask()
    void renders.track(1, one)
    void renders.track(2, two)
    await renders.cancel(1)
    expect(one.cancelled()).toBe(true)
    expect(two.cancelled()).toBe(false)
    expect(renders.isRendering(2)).toBe(true)
  })
})
