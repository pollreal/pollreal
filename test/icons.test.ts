import { describe, expect, it } from 'vitest'
import { iconDomain, iconLinks, parentDomain, sniff } from '../src/lib/icons'

describe('maker icons', () => {
  it('derives the domain from the official URL', () => {
    expect(iconDomain('https://www.logitech.com/en-us/products/x.html')).toBe('logitech.com')
    expect(iconDomain('https://openai.com/chatgpt')).toBe('openai.com')
    expect(iconDomain('javascript:alert(1)')).toBeNull()
    expect(iconDomain('not a url')).toBeNull()
    expect(iconDomain(null)).toBeNull()
  })

  it('falls back to the parent domain, never to a public suffix', () => {
    expect(parentDomain('docs.midjourney.com')).toBe('midjourney.com')
    expect(parentDomain('openai.com')).toBeNull()
    expect(parentDomain('shop.example.co.kr')).toBe('example.co.kr')
    expect(parentDomain('example.co.kr')).toBeNull()
  })

  it('accepts raster images only', () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('image/png')
    expect(sniff(new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 0, 0]))).toBe('image/x-icon')
    expect(sniff(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniff(new TextEncoder().encode('<!doctype html><html>'))).toBeNull()
  })

  it('ranks apple-touch-icon first and skips SVG', () => {
    const html = `<link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/i.svg"><link rel="apple-touch-icon" href="/apple.png"><link rel="mask-icon" href="/m.svg">`
    const links = iconLinks(html, 'https://example.com/page')
    expect(links.map((l) => l.href)).toEqual(['https://example.com/apple.png', 'https://example.com/favicon-32.png'])
  })
})
