import * as net from 'net'
import { parseHTML } from './parser'

export interface optionsInter {
  method?: 'GET' | 'POST',
  host: string,
  port?: number,
  path?: string,
  body?: object,
  headers?: object,
}

class Request {
  private method: 'GET' | 'POST'
  private host: string
  private port: number
  private path: string
  private body: object
  private headers: object
  private bodyText: string

  constructor(options: optionsInter) {
    this.method = options.method || 'GET'
    this.host = options.host
    this.port = options.port || 8080
    this.path = options.path || '/'
    this.body = options.body || {}
    this.headers = options.headers || {}
    if (!this.headers['Content-Type']) {
      this.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    }
    if (this.headers['Content-Type'] === 'application/json') {
      this.bodyText = JSON.stringify(this.body)
    } else if (this.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
      this.bodyText = Object.keys(this.body).map(key => `${key}=${encodeURIComponent(this.body[key])}`).join('&')
    }
    this.headers['Content-Length'] = this.bodyText.length
  }

  toString() {
    return `${this.method} ${this.path} HTTP/1.1\r
${Object.keys(this.headers).map(key => `${key}: ${this.headers[key]}`).join('\r\n')}\r
\r
${this.bodyText}`
  }

  send(connection?) {
    return new Promise((resolve, reject) => {
      const parser = new ResponseParser
      if (connection) {
        connection.write(this.toString())
      } else {
        connection = net.createConnection({
          host: this.host,
          port: this.port
        }, () => {
          connection.write(this.toString())
        })
        connection.on('data', data => {
          parser.receive(data.toString())
          if (parser.isFinished) {
            resolve(parser.response)
          }
          connection.end()
        })
        connection.on('error', err => {
          reject(err)
          connection.end()
        })
      }
    })
  }
}

class Response {

}

class ResponseParser {
  private WAITTING_STATUS_LINE: number
  private WAITING_STATUS_LINE_END: number
  private WAITING_HEADER_NAME: number
  private WAITING_HEADER_SPACE: number
  private WAITING_HEADER_VALUE: number
  private WAITING_HEADER_LINE_END: number
  private WAITING_HEADER_BLOCK_END: number
  private WAITING_BODY: number

  private current: number
  private statusLine: string
  private headers: object
  private headerName: string
  private headerValue: string
  private bodyParser: object

  constructor() {
    this.WAITTING_STATUS_LINE = 0
    this.WAITING_STATUS_LINE_END = 1
    this.WAITING_HEADER_NAME = 2
    this.WAITING_HEADER_SPACE = 3
    this.WAITING_HEADER_VALUE = 4
    this.WAITING_HEADER_LINE_END = 5
    this.WAITING_HEADER_BLOCK_END = 6
    this.WAITING_BODY = 7

    this.current = this.WAITTING_STATUS_LINE
    this.statusLine = ''
    this.headers = {}
    this.headerName = ''
    this.headerValue = ''
    this.bodyParser = null
  }

  get isFinished() {
    return this.bodyParser && (this.bodyParser as TrunkBodyParser).isFinished
  }

  get response() {
    this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/)
    return {
      statusCode: RegExp.$1,
      statusText: RegExp.$2,
      headers: this.headers,
      body: (this.bodyParser as TrunkBodyParser).content.join('')
    }
  }

  receive(string: string) {
    for (let i = 0; i < string.length; i++) {
      this.receiveChar(string.charAt(i))
    }
  }

  receiveChar(char: string) {
    if (this.current === this.WAITTING_STATUS_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_STATUS_LINE_END
      } else {
        this.statusLine += char
      }
    } else if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }
    } else if (this.current === this.WAITING_HEADER_NAME) {
      if (char === ':') {
        this.current = this.WAITING_HEADER_SPACE
      } else if (char === '\r') {
        this.current = this.WAITING_HEADER_BLOCK_END
        if (this.headers['Transfer-Encoding'] === 'chunked')
          this.bodyParser = new TrunkBodyParser()
      } else {
        this.headerName += char
      }
    } else if (this.current === this.WAITING_HEADER_SPACE) {
      if (char === ' ') {
        this.current = this.WAITING_HEADER_VALUE
      }
    } else if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === '\r') {
        this.current = this.WAITING_HEADER_LINE_END
        this.headers[this.headerName as string] = this.headerValue
        this.headerName = ''
        this.headerValue = ''
      } else {
        this.headerValue += char
      }
    } else if (this.current === this.WAITING_HEADER_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }
    } else if (this.current === this.WAITING_HEADER_BLOCK_END) {
      if (char === '\n') {
        this.current = this.WAITING_BODY
      }
    } else if (this.current === this.WAITING_BODY) {
      (this.bodyParser as TrunkBodyParser).receiveChar(char)
    }
  }
}

class TrunkBodyParser {
  private WAITING_LENGTH: number
  private WAITING_LENGTH_LINE_END: number
  private READING_TRUNK: number
  private WAITING_NEW_LINE: number
  private WAITING_NEW_LINE_END: number

  public content: string[]
  private current: number
  private length: number
  public isFinished: boolean
  constructor() {
    this.WAITING_LENGTH = 0
    this.WAITING_LENGTH_LINE_END = 1
    this.READING_TRUNK = 2
    this.WAITING_NEW_LINE = 3
    this.WAITING_NEW_LINE_END = 4

    this.content = []
    this.current = this.WAITING_LENGTH
    this.length = 0
    this.isFinished = false
  }

  receiveChar(char: string) {
    if (this.current === this.WAITING_LENGTH) {
      if (char === '\r') {
        if (this.length === 0) {
          this.isFinished = true
        }
        this.current = this.WAITING_LENGTH_LINE_END
      } else {
        this.length *= 16
        this.length += parseInt(char, 16)
      }
    } else if (this.current === this.WAITING_LENGTH_LINE_END) {
      if (char === '\n') {
        this.current = this.READING_TRUNK
      }
    } else if (this.current === this.READING_TRUNK) {
      this.content.push(char)
      this.length--
      if (this.length === 0) {
        this.current = this.WAITING_NEW_LINE
      }
    } else if (this.current === this.WAITING_NEW_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_NEW_LINE_END
      }
    } else if (this.current === this.WAITING_NEW_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_LENGTH
      }
    }
  }
}

void async function () {
  const r = new Request({
    method: 'POST',
    host: '127.0.0.1',
    port: 8080,
    headers: {
      'X-foo': 'Bar'
    },
    body: {
      name: 'nbili'
    }
  })
  const response = await r.send()
  const dom = parseHTML((response as any).body)
}()
