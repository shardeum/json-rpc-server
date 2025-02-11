import winston, { format } from 'winston'
const { printf, timestamp, colorize, combine } = format

const singleLineFormat = format((info) => {
  // Keep timestamp and level as is
  const { timestamp, level, ...rest } = info

  // Stringify any object properties
  Object.keys(rest).forEach((key) => {
    if (typeof rest[key] === 'object') {
      rest[key] = JSON.stringify(rest[key])
    }
  })

  return { ...rest, timestamp, level }
})

const uppercaseFormat = format((info) => {
  return { ...info, level: info.level.toUpperCase() }
})

const customFormat = printf((info) => {
  const { timestamp, level, message, ...rest } = info
  const logObject = typeof message === 'object' ? message : { ...rest, message }
  return `${timestamp} ${level} ${JSON.stringify(logObject)}`
})

type LoggerOptions = {
  enableConsole: boolean
  enableFile: boolean
  filename: string
}

const defaultOptions: LoggerOptions = {
  // TODO: add logLevels from winston
  enableConsole: true,
  enableFile: false,
  filename: 'logs/requests.log',
}

const createLogger = (options: LoggerOptions) => {
  const { enableConsole, enableFile, filename } = { ...defaultOptions, ...options }
  const transports = []
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        format: combine(
          timestamp(),
          uppercaseFormat(),
          colorize({ all: false, level: true }),
          customFormat
        ),
      })
    )
  }
  if (enableFile) {
    transports.push(
      new winston.transports.File({
        filename,
        format: combine(timestamp(), uppercaseFormat(), customFormat, singleLineFormat()),
      })
    )
  }
  return winston.createLogger({
    transports,
  })
}
export default createLogger
