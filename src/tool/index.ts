import type { Tool } from 'xsai'
import { weather } from './weather'

export async function setupTools(): Promise<Tool[]> {
  return await Promise.all([
    weather(),
  ])
}
