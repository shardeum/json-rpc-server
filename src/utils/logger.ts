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
        format: combine(timestamp(), uppercaseFormat(), customFormat),
      })
    )
  }
  return winston.createLogger({
    transports,
  })
}
export default createLogger

// type ConsoleLogLike = (...args: unknown[]) => void

// export class Logger {
//   private logger: ConsoleLogLike
//   constructor(logger: ConsoleLogLike = console.log) {
//     this.logger = logger
//   }
//   info(...args: unknown[]) {
//     this._log('INFO', ...args)
//   }

//   error(...args: unknown[]) {
//     this._log('ERROR', ...args)
//   }

//   debug(...args: unknown[]) {
//     this._log('DEBUG', ...args)
//   }

//   warn(...args: unknown[]) {
//     this._log('WARN', ...args)
//   }

//   _log(level: string, ...args: unknown[]) {
//     this.logger(
//       `${new Date().toISOString()} ${level} ${
//         args.map((arg) => {
//           if (arg === undefined) return 'undefined'
//           return typeof arg === 'string' ? arg : JSON.stringify(arg)
//         }).join(' ')
//       }`
//     )
//   }
// }

// export default new Logger()
