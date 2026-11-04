import { describe, expect, it } from 'vitest'
import { inAppOf } from '../src/lib/inapp'

const URL_ = 'https://pollreal.com/login?next=%2F'

describe('in-app browser detection', () => {
  it('sends KakaoTalk to the external browser on both systems', () => {
    const ios = inAppOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0', URL_)
    expect(ios?.app).toBe('kakaotalk')
    expect(ios?.openUrl).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`)
    const and = inAppOf('Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 KAKAOTALK/25.9.0', URL_)
    expect(and?.app).toBe('kakaotalk')
  })

  it('gives Android in-app browsers a Chrome intent and iOS ones only instructions', () => {
    const ig = inAppOf('Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36 Instagram 350.0', URL_)
    expect(ig?.app).toBe('instagram')
    expect(ig?.openUrl?.startsWith('intent://pollreal.com/login?next=%2F#Intent;scheme=https;')).toBe(true)
    const fb = inAppOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]', URL_)
    expect(fb).toEqual({ app: 'facebook', os: 'ios', openUrl: null })
  })

  it('leaves real browsers alone', () => {
    expect(inAppOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', URL_)).toBeNull()
    expect(inAppOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', URL_)).toBeNull()
    expect(inAppOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', URL_)).toBeNull()
    expect(inAppOf(undefined, URL_)).toBeNull()
  })
})
