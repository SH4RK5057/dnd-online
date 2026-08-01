import { describe, expect, it } from 'vitest'
import { resolveCanvasSizeCells } from './canvasSize'

describe('resolveCanvasSizeCells', () => {
  it('returns null when there is neither a scene nor an image', () => {
    expect(resolveCanvasSizeCells(null, null)).toBeNull()
  })

  it('falls back to the app default blank-canvas size when the scene has never customized it', () => {
    expect(resolveCanvasSizeCells({ blankWidthCells: null, blankHeightCells: null }, null)).toEqual({
      widthCells: 30,
      heightCells: 20,
    })
  })

  it('uses the scene-customized blank-canvas size when there is no image', () => {
    expect(resolveCanvasSizeCells({ blankWidthCells: 12, blankHeightCells: 8 }, null)).toEqual({
      widthCells: 12,
      heightCells: 8,
    })
  })

  it('uses the image size unchanged when blank dims were never customized', () => {
    expect(resolveCanvasSizeCells({ blankWidthCells: null, blankHeightCells: null }, { widthCells: 5.7, heightCells: 4.3 })).toEqual({
      widthCells: 5.7,
      heightCells: 4.3,
    })
  })

  it('never shrinks the image below its own size, even if the DM set smaller blank dims', () => {
    expect(resolveCanvasSizeCells({ blankWidthCells: 3, blankHeightCells: 3 }, { widthCells: 10, heightCells: 8 })).toEqual({
      widthCells: 10,
      heightCells: 8,
    })
  })

  it('extends the image past its own edges when the DM set larger blank dims', () => {
    expect(resolveCanvasSizeCells({ blankWidthCells: 30, blankHeightCells: 20 }, { widthCells: 5.7, heightCells: 4.3 })).toEqual({
      widthCells: 30,
      heightCells: 20,
    })
  })

  it('extends only the axis the DM actually customized', () => {
    expect(resolveCanvasSizeCells({ blankWidthCells: 30, blankHeightCells: null }, { widthCells: 5.7, heightCells: 4.3 })).toEqual({
      widthCells: 30,
      heightCells: 4.3,
    })
  })
})
