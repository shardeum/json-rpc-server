import pino from 'pino'

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
    // Only use sync mode if we're writing to console (needed for tests)
    sync: enableConsole
  }

  const streams = []
  
  if (enableConsole) {
    streams.push({ stream: process.stdout })
  }
  
  if (enableFile) {
    streams.push({ 
      stream: pino.destination({ 
        dest: filename,
        // Use async mode for better performance if only writing to file
        sync: enableConsole,
        mkdir: true
      })
    })
  }

  return pino(
    baseOptions,
    pino.multistream(streams)
  )
}

export default createLogger
