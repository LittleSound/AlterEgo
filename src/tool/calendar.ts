import type { Context } from 'grammy'
import type { AppEnv } from '../env'
import { InputFile } from 'grammy'

import * as v from 'valibot'
import { generateText, tool } from 'xsai'
import { error, log } from '../log'
import { recordAssistantText } from '../session'

// Generate a brief AI description for the calendar event
async function generateEventDescription(title: string, startTime: string, endTime: string, location: string, timezone: string, env?: AppEnv): Promise<string> {
  if (!env?.AI_OPENROUTER_API_KEY) {
    return `📅 ${title}`
  }

  try {
    const { text } = await generateText({
      apiKey: env.AI_OPENROUTER_API_KEY,
      baseURL: env.AI_OPENROUTER_BASE_URL,
      model: env.AI_LLM_DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet',
      messages: [{
        role: 'user',
        content: `Generate a brief, engaging description (max 50 characters) for this calendar event:
Title: ${title}
Time: (${timezone}) ${startTime} - ${endTime}
Location: ${location || 'Not specified'}

Make it concise and informative. Use emojis if appropriate. Focus on the essence of the event.`,
      }],
      maxTokens: 100,
    })

    return (text || '').trim().substring(0, 50) || `📅 ${title}`
  }
  catch (err) {
    log('[CALENDAR] Failed to generate AI description:', err)
    return `📅 ${title}`
  }
}

export async function createCalendar(option: { ctx: Context, env?: AppEnv }) {
  return await tool({
    name: 'schedule',
    description: 'Create an .ics calendar event file and send it to the user via Telegram. When users wants to do something in the future, create a schedule. Ask the user or search to find schedule information.',
    parameters: v.object({
      title: v.pipe(
        v.string(),
        v.minLength(1),
        v.description('title/summary (e.g., "Apple Event", "Team Meeting").'),
      ),
      startTime: v.pipe(
        v.string(),
        v.description('Event start time in ISO 8601 format, e.g., "2025-12-30T19:00:00" (local time based on timezone parameter).'),
      ),
      endTime: v.pipe(
        v.string(),
        v.description('Event end time in ISO 8601 format, e.g., "2025-12-30T22:00:00" (local time based on timezone parameter).'),
      ),
      timezone: v.pipe(
        v.string(),
        v.description('IANA timezone identifier (e.g., "Asia/Shanghai", "America/New_York", "Europe/London"). If you don\'t know, ask the user or search'),
      ),
      description: v.optional(v.pipe(
        v.string(),
        v.description('Detailed event description with key information, links, or notes.'),
      )),
      location: v.optional(v.pipe(
        v.string(),
        v.description('location (e.g., "上海市徐汇区西岸国际会议中心", "Online", "Conference Room A").'),
      )),
    }),
    execute: async ({ title, startTime, endTime, location, description, timezone = 'Asia/Shanghai' }) => {
      try {
        log(`[CALENDAR] Creating event: ${title} at ${startTime}`)

        // Parse and validate times
        const start = parseISOTime(startTime)
        const end = parseISOTime(endTime)

        if (!start || !end) {
          return '❌ Error: Invalid time format. Please use ISO 8601 format like "2025-12-30T19:00:00".'
        }

        if (end <= start) {
          return '❌ Error: End time must be after start time.'
        }

        // Get timezone offset
        const tzOffset = getTimezoneOffset(timezone)

        // Generate .ics content
        const icsContent = generateICS({
          title,
          startTime: start,
          endTime: end,
          location,
          description,
          timezone,
          tzOffset,
        })

        // Create a safe filename
        const safeTitle = title.replace(/[^a-z0-9\u4E00-\u9FA5]/gi, '_').substring(0, 50)
        const filename = `${safeTitle}_${start.toISOString().split('T')[0]}.ics`

        // Generate AI description for the caption
        const aiDescription = await generateEventDescription(title, startTime, endTime, location || '', timezone, option.env)

        // Send the .ics file via Telegram
        // Convert to Uint8Array for grammY compatibility
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        const file = new InputFile(uint8Array, filename)

        await option.ctx.replyWithDocument(file, {
          caption: `${aiDescription}`,
        })
        recordAssistantText(option.ctx, `[Tools Info: Calendar sent.] \n${aiDescription}`)

        return `✅ Calendar event "${title}" has been created and sent to you as an .ics file. You can import it into any calendar application.`
      }
      catch (err) {
        error('Failed to create calendar event:', err)
        return `❌ Failed to create calendar event: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}

function parseISOTime(isoString: string): Date | null {
  try {
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return date
  }
  catch {
    return null
  }
}

function getTimezoneOffset(timezone: string): string {
  // Common timezone offsets
  const tzMap: Record<string, string> = {
    'Asia/Shanghai': '+0800',
    'Asia/Beijing': '+0800',
    'Asia/Hong_Kong': '+0800',
    'Asia/Tokyo': '+0900',
    'Asia/Seoul': '+0900',
    'Asia/Singapore': '+0800',
    'America/New_York': '-0500', // EST
    'America/Los_Angeles': '-0800', // PST
    'Europe/London': '+0000', // GMT
    'Europe/Paris': '+0100', // CET
    'UTC': '+0000',
  }

  return tzMap[timezone] || '+0800' // Default to CST
}

function formatICSDateTime(date: Date): string {
  // Format: YYYYMMDDTHHmmss
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}T${hour}${minute}${second}`
}

function generateICS(params: {
  title: string
  startTime: Date
  endTime: Date
  location?: string
  description?: string
  timezone: string
  tzOffset: string
}): string {
  const { title, startTime, endTime, location, description, timezone, tzOffset } = params

  const uid = `${Date.now()}-${Math.random().toString(36).substring(2)}@alterego`
  const dtstamp = formatICSDateTime(new Date())
  const dtstart = formatICSDateTime(startTime)
  const dtend = formatICSDateTime(endTime)

  // Escape special characters in description
  const escapeICS = (text: string) => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  }

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Alter Ego//Calendar Event//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VTIMEZONE
TZID:${timezone}
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:${tzOffset}
TZOFFSETTO:${tzOffset}
TZNAME:${timezone.split('/')[1] || 'Local'}
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}Z
DTSTART;TZID=${timezone}:${dtstart}
DTEND;TZID=${timezone}:${dtend}
SUMMARY:${escapeICS(title)}
`

  if (location) {
    ics += `LOCATION:${escapeICS(location)}\n`
  }

  if (description) {
    ics += `DESCRIPTION:${escapeICS(description)}\n`
  }

  ics += `STATUS:CONFIRMED
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:${escapeICS(title)} is starting soon
TRIGGER:-P1D
END:VALARM
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:${escapeICS(title)} is starting in 3 hours
TRIGGER:-PT3H
END:VALARM
END:VEVENT
END:VCALENDAR
`

  return ics
}
