import * as http from 'http'
import * as fs from 'fs'

const server = http.createServer((req, res) => {
  res.setHeader('X-Foo', 'bar')
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  const template = fs.readFileSync('./template.html')
  res.end(template)
})

server.listen(8080)
