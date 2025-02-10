import { existsSync, unlinkSync } from 'fs'
import createLogger from '../../../src/utils/logger'
import { transports } from 'winston'

describe('Logger', () => {
  const testLogFile = 'test-logs.log'
  
  // Clean up test log file after each test
  afterEach(() => {
    if (existsSync(testLogFile)) {
      unlinkSync(testLogFile)
    }
  })

  it('should create a console-only logger when enableFile is false', () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: false,
      filename: testLogFile
    })
    
    expect(logger.transports).toHaveLength(1)
    expect(logger.transports[0]).toBeInstanceOf(transports.Console)
  })

  it('should create a file-only logger when enableConsole is false', () => {
    const logger = createLogger({
      enableConsole: false,
      enableFile: true,
      filename: testLogFile
    })
    
    expect(logger.transports).toHaveLength(1)
    expect(logger.transports[0]).toBeInstanceOf(transports.File)
  })

  it('should create both console and file transports when both are enabled', () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: true,
      filename: testLogFile
    })
    
    expect(logger.transports).toHaveLength(2)
    expect(logger.transports.some(t => t instanceof transports.Console)).toBe(true)
    expect(logger.transports.some(t => t instanceof transports.File)).toBe(true)
  })

  it('should use default options when none are provided', () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: false,
      filename: testLogFile
    })
    
    expect(logger.transports).toHaveLength(1)
    expect(logger.transports[0]).toBeInstanceOf(transports.Console)
  })

  it('should write logs to file when file transport is enabled', async () => {
    const logger = createLogger({
      enableConsole: false,
      enableFile: true,
      filename: testLogFile
    })

    const testMessage = 'Test log message'
    logger.info(testMessage)
    
    // Wait a bit for the file to be written
    await new Promise(resolve => setTimeout(resolve, 100))
    
    expect(existsSync(testLogFile)).toBe(true)
  })

  it('should format object messages correctly', async () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: false,
      filename: testLogFile
    })

    const stdoutSpy = jest.spyOn(process.stdout, 'write')
    const testObject = { key: 'value', nested: { prop: 'test' } }
    
    logger.info('Test message', testObject)
    
    expect(stdoutSpy).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map(call => call[0].toString()).join('')
    expect(output).toContain('Test message')
    stdoutSpy.mockRestore()
  })
}) 