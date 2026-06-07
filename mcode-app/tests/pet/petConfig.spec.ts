import { getBubbleTemplate, pickBubbleMessage } from '@/services/petConfig'

describe('pet bubble copy', () => {
  it('returns a full message payload for evening greetings', () => {
    const message = pickBubbleMessage('evening')
    const template = getBubbleTemplate('evening')

    expect(message).not.toBeNull()
    expect(template).not.toBeNull()
    expect(template?.texts).toContain(message?.text)
    expect(message?.duration).toBe(template?.duration)
  })

  it('keeps excited interaction copy separate from the normal tap copy', () => {
    const normal = getBubbleTemplate('pet_interact')
    const excited = getBubbleTemplate('pet_interact_excited')

    expect(normal?.texts).not.toEqual(excited?.texts)
  })
})
