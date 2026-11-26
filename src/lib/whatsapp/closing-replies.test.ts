import { describe, it, expect } from 'vitest'
import {
  isClosingOrGratitudeMessage,
  isHinglishClosing,
  getClosingReply,
  CLOSING_REPLY_ENGLISH,
  CLOSING_REPLY_HINGLISH,
} from './closing-replies'

describe('WhatsApp Closing & Gratitude Replies Module', () => {
  describe('isClosingOrGratitudeMessage', () => {
    const positiveCases = [
      'ok',
      'okay',
      'okk',
      'thanks',
      'thank you',
      'thank u',
      'thx',
      'shukriya',
      'dhanyawad',
      'dhanyavaad',
      'ji',
      'theek hai',
      'thik hai',
      'achha',
      'accha',
      'nice',
      '👍',
      '👍🏻',
      'ok thanks',
      'okay ji',
      'theek hai ji',
      'achha ji',
      'shukriya bhai',
      'thank you saud bhai',
      'ji shukriya',
      'nice 👍',
      'thanks! 😊',
      'thank you so much 🙏',
      'ok! 👍',
      'theek h',
      'very nice',
      'good',
      'great',
    ]

    for (const phrase of positiveCases) {
      it(`identifies "${phrase}" as a closing / gratitude remark`, () => {
        expect(isClosingOrGratitudeMessage(phrase)).toBe(true)
      })
    }

    const negativeCases = [
      'ok pulsar 150 brake shoe price',
      'thanks for activa battery price',
      'theek hai splendor chain sprocket bhej do',
      'ji haan',
      'haan ji',
      'ji ha',
      'ha ji',
      'hero splendor clutch plate',
      'bajaj platina price',
      'kailashpur shop location',
      'where is shop',
    ]

    for (const phrase of negativeCases) {
      it(`does NOT identify query "${phrase}" as a closing remark`, () => {
        expect(isClosingOrGratitudeMessage(phrase)).toBe(false)
      })
    }

    it('returns false for empty or whitespace-only strings', () => {
      expect(isClosingOrGratitudeMessage('')).toBe(false)
      expect(isClosingOrGratitudeMessage('   ')).toBe(false)
    })
  })

  describe('isHinglishClosing & getClosingReply', () => {
    it('returns English closing reply for English remarks', () => {
      expect(isHinglishClosing('thank you')).toBe(false)
      expect(getClosingReply('thank you')).toBe(CLOSING_REPLY_ENGLISH)
      expect(getClosingReply('thanks')).toBe(CLOSING_REPLY_ENGLISH)
      expect(getClosingReply('nice')).toBe(CLOSING_REPLY_ENGLISH)
      expect(getClosingReply('thx')).toBe(CLOSING_REPLY_ENGLISH)
    })

    it('returns Hinglish closing reply for Hindi/Hinglish remarks', () => {
      expect(isHinglishClosing('shukriya')).toBe(true)
      expect(getClosingReply('shukriya')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('dhanyawad')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('theek hai')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('achha')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('ji')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('theek hai ji')).toBe(CLOSING_REPLY_HINGLISH)
    })

    it('honors preferredLanguage when provided', () => {
      expect(getClosingReply('ok', 'hinglish')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('ok', 'en')).toBe(CLOSING_REPLY_ENGLISH)
      expect(getClosingReply('👍', 'hinglish')).toBe(CLOSING_REPLY_HINGLISH)
      expect(getClosingReply('👍', 'en')).toBe(CLOSING_REPLY_ENGLISH)
    })

    it('ensures clean, warm closing text with NO customer care phone numbers or menus', () => {
      // English reply check
      expect(CLOSING_REPLY_ENGLISH).toContain("You're most welcome! 😊")
      expect(CLOSING_REPLY_ENGLISH).toContain('Bajaj, Hero, or Honda')
      expect(CLOSING_REPLY_ENGLISH).not.toContain('9634722174')
      expect(CLOSING_REPLY_ENGLISH).not.toContain('View Menu')
      expect(CLOSING_REPLY_ENGLISH).not.toContain('Customer Care')

      // Hinglish reply check
      expect(CLOSING_REPLY_HINGLISH).toContain('Aapka bahut-bahut shukriya! 😊')
      expect(CLOSING_REPLY_HINGLISH).toContain('Bajaj, Hero ya Honda')
      expect(CLOSING_REPLY_HINGLISH).not.toContain('9634722174')
      expect(CLOSING_REPLY_HINGLISH).not.toContain('View Menu')
      expect(CLOSING_REPLY_HINGLISH).not.toContain('Customer Care')
    })
  })
})
