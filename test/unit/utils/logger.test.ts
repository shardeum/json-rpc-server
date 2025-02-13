import { existsSync, unlinkSync, readFileSync } from 'fs'
import createLogger from '../../../src/utils/logger'

describe('Logger', () => {
  const testLogFile = 'test-logs.log'
  let stdoutSpy: jest.SpyInstance
  
  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    if (existsSync(testLogFile)) {
      unlinkSync(testLogFile)
    }
    stdoutSpy.mockRestore()
  })

  it('should create a console-only logger when enableFile is false', () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: false,
      filename: testLogFile
    })
    
    logger.info('Test message')
    expect(stdoutSpy).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map(call => call[0].toString()).join('')
    const logObject = JSON.parse(output)
    expect(logObject.level).toBe('INFO')
    expect(logObject.msg).toBe('Test message')
    expect(logObject.time).toBeDefined()
  })

  it('should create a file-only logger when enableConsole is false', async () => {
    const logger = createLogger({
      enableConsole: false,
      enableFile: true,
      filename: testLogFile
    })
    
    logger.info('Test message')
    
    // Wait for file write
    await new Promise(resolve => setTimeout(resolve, 100))
    
    expect(existsSync(testLogFile)).toBe(true)
    const fileContent = readFileSync(testLogFile, 'utf8')
    const logObject = JSON.parse(fileContent)
    expect(logObject.level).toBe('INFO')
    expect(logObject.msg).toBe('Test message')
    expect(logObject.time).toBeDefined()
  })

  it('should create both console and file outputs when both are enabled', async () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: true,
      filename: testLogFile
    })
    
    logger.info('Test message')
    
    // Wait for file write
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check console output
    expect(stdoutSpy).toHaveBeenCalled()
    const consoleOutput = stdoutSpy.mock.calls.map(call => call[0].toString()).join('')
    const consoleLogObject = JSON.parse(consoleOutput)
    expect(consoleLogObject.level).toBe('INFO')
    expect(consoleLogObject.msg).toBe('Test message')
    expect(consoleLogObject.time).toBeDefined()
    
    // Check file output
    expect(existsSync(testLogFile)).toBe(true)
    const fileContent = readFileSync(testLogFile, 'utf8')
    const fileLogObject = JSON.parse(fileContent)
    expect(fileLogObject.level).toBe('INFO')
    expect(fileLogObject.msg).toBe('Test message')
    expect(fileLogObject.time).toBeDefined()
  })

  it('should use default options when none are provided', () => {
    const logger = createLogger({} as any)
    
    logger.info('Test message')
    expect(stdoutSpy).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map(call => call[0].toString()).join('')
    const logObject = JSON.parse(output)
    expect(logObject.level).toBe('INFO')
    expect(logObject.msg).toBe('Test message')
    expect(logObject.time).toBeDefined()
  })

  it('should format object messages correctly', () => {
    const logger = createLogger({
      enableConsole: true,
      enableFile: false,
      filename: testLogFile
    })

    const testObject = { key: 'value', nested: { prop: 'test' } }
    logger.info({ message: 'Test message', ...testObject })
    
    expect(stdoutSpy).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map(call => call[0].toString()).join('')
    const logObject = JSON.parse(output)
    expect(logObject.level).toBe('INFO')
    expect(logObject.message).toBe('Test message')
    expect(logObject.key).toBe('value')
    expect(logObject.nested).toEqual({ prop: 'test' })
    expect(logObject.time).toBeDefined()
  })
}) 