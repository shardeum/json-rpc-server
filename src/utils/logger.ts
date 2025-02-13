import pino from 'pino'
import { WriteStream } from 'fs'

type LoggerOptions = {
  enableConsole: boolean
  enableFile: boolean
  filename: string
}

const defaultOptions: LoggerOptions = {
  enableConsole: true,
  enableFile: false,
  filename: 'logs/requests.log',
}

const createLogger = (options: LoggerOptions) => {
  const { enableConsole, enableFile, filename } = { ...defaultOptions, ...options }
  
  const baseOptions = {
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() }
      }
    },
    timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
  }

  const destinations: any[] = []
  
  if (enableConsole) {
    destinations.push(pino.destination({ 
      sync: true,
      dest: 1, // stdout
      minLength: 4096, // Ensure immediate flushing
      mkdir: true
    }))
  }
  
  if (enableFile) {
    destinations.push(pino.destination({ 
      sync: true,
      dest: filename,
      minLength: 4096, // Ensure immediate flushing
      mkdir: true
    }))
  }

  const streams = destinations.map(dest => ({ stream: dest }))

  return pino(
    baseOptions,
    pino.multistream(streams)
  )
}

export default createLogger
